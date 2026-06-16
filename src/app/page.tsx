import Link from "next/link";
import {
  BookOpen,
  Camera,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Flag,
  Info,
  Newspaper,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { autoLinkPlayers } from "@/lib/ensure-profile";
import { buildFeedItems, FEED_COLOR, FEED_ICON, relTime } from "@/lib/feed";
import {
  bestBallBonusPerHole,
  computeCupStandings,
  computeRoundLeaderboard,
  formatToPar,
  matchResult,
  runMatchPlay,
  scrambleMatchPerHole,
  singlesPerHoleNet,
  toParTone,
  type Course as ScCourse,
  type HoleScore,
} from "@/lib/scoring";
import { FORMAT_LABEL } from "@/lib/trip-formats";
import type { Course, Hole, Match, Photo, Player, PlayerRoundSettings, Round, Score, Team } from "@/lib/db";
import { LeaderboardTicker, type TickerRow } from "@/components/home/leaderboard-ticker";
import { HomeHero, type HeroState } from "@/components/home/home-hero";
import { DayStrip, type DayCard } from "@/components/home/day-strip";
import { LivePulse } from "@/components/home/live-pulse";
import { RealtimeRefresh } from "@/app/leaderboard/realtime-refresh";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <SignedOutSplash />;

  await autoLinkPlayers();
  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="space-y-6 pt-6">
        <Brand />
        <div className="card text-center space-y-2">
          <h2 className="font-serif text-xl font-semibold">No active trip yet</h2>
          <p className="text-sm text-muted-foreground">
            Open your trip's join link (/join/&lt;code&gt;), or create one from
            Admin to get the board rolling.
          </p>
        </div>
      </div>
    );
  }

  // ---- Leaderboard preview: Ryder Cup → USA vs Europe total points;
  //      casual → rolling net-to-par ticker of the active round. ------------
  const [
    { data: roundsRaw },
    { data: playersRaw },
    { data: teamsRaw },
    { data: coursesRaw },
  ] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id),
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("courses").select("id, name").eq("trip_id", trip.id),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const teams = (teamsRaw ?? []) as Team[];
  const courses = (coursesRaw ?? []) as Pick<Course, "id" | "name">[];
  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));

  let scores: Score[] = [];
  let matches: Match[] = [];
  if (rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    const [{ data: sData }, { data: mData }] = await Promise.all([
      supabase.from("scores").select("*").in("round_id", roundIds),
      supabase.from("matches").select("*").in("round_id", roundIds),
    ]);
    scores = (sData ?? []) as Score[];
    matches = (mData ?? []) as Match[];
  }

  // Active round = most recent round that has any score, else the first.
  const activeRound =
    [...rounds].reverse().find((r) => scores.some((s) => s.round_id === r.id)) ?? rounds[0] ?? null;

  // Holes per course (trips can play a different course each day).
  const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[];
  let allHoles: Hole[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase
      .from("holes")
      .select("*")
      .in("course_id", courseIds)
      .order("hole_number");
    allHoles = (data ?? []) as Hole[];
  }
  const holesByCourse = new Map<string, Hole[]>();
  for (const h of allHoles) (holesByCourse.get(h.course_id) ?? holesByCourse.set(h.course_id, []).get(h.course_id)!).push(h);
  const courseFor = (r: Round | undefined): ScCourse => ({
    holes: r?.course_id ? holesByCourse.get(r.course_id) ?? [] : [],
  });

  const isRyder = trip.trip_type === "ryder_cup";

  // Ryder Cup preview = USA vs Europe cup standings (matches across the trip).
  const cup = isRyder
    ? computeCupStandings(
        matches
          .map((m) => matchPointsFor(m, rounds, scores, players, courseFor))
          .filter(Boolean) as { team_a_points: number; team_b_points: number }[],
        {
          pointsToWin: Number(trip.points_to_win),
          totalPoints: trip.total_points,
          tieOutcomeLabel: trip.tie_outcome_label,
        }
      )
    : null;

  // Casual preview = per-player rolling ticker (unchanged behavior).
  let tickerRows: TickerRow[] = [];
  if (!isRyder && activeRound) {
    const activeCourse = courseFor(activeRound);
    if (activeCourse.holes.length > 0) {
      const scoresByPlayer: Record<string, HoleScore[]> = {};
      for (const s of scores.filter((s) => s.round_id === activeRound.id)) {
        if (!s.player_id) continue;
        (scoresByPlayer[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
      }
      const board = computeRoundLeaderboard(
        players.map((p) => ({ id: p.id, name: p.name, index: Number(p.handicap_index) })),
        scoresByPlayer,
        activeCourse
      );
      tickerRows = board
        .filter((r) => r.thru > 0)
        .map((r) => ({
          player_id: r.player_id,
          name: r.name,
          scoreText: formatToPar(r.toPar),
          tone: toParTone(r.toPar),
          thru: r.thru,
        }));
    }
  }

  // ---- Day-strip + hero state -------------------------------------------
  let prs: PlayerRoundSettings[] = [];
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("player_round_settings")
      .select("round_id, tee_time")
      .in("round_id", rounds.map((r) => r.id));
    prs = (data ?? []) as PlayerRoundSettings[];
  }
  const earliestTeeByRound = new Map<string, string>();
  for (const r of prs) {
    if (!r.tee_time) continue;
    const cur = earliestTeeByRound.get(r.round_id);
    if (!cur || r.tee_time < cur) earliestTeeByRound.set(r.round_id, r.tee_time);
  }

  // Determine which day is "current" — the latest round with any scores, or
  // the first un-played round if none have scores yet.
  const scoredRoundIds = new Set(scores.map((s) => s.round_id));
  const currentRoundId =
    [...rounds].reverse().find((r) => scoredRoundIds.has(r.id))?.id ??
    rounds.find((r) => !scoredRoundIds.has(r.id))?.id ??
    null;

  const dayCards: DayCard[] = rounds.map((r) => ({
    round_id: r.id,
    day_number: r.day_number,
    course_name: r.course_id ? courseNameById.get(r.course_id) ?? null : null,
    format_label: FORMAT_LABEL[r.format],
    date_label: r.date ? formatDateLabel(r.date) : null,
    earliest_tee_time: earliestTeeByRound.get(r.id) ? formatTimeLabel(earliestTeeByRound.get(r.id)!) : null,
    current: r.id === currentRoundId,
  }));

  const heroState: HeroState = computeHeroState({
    startDate: trip.start_date,
    endDate: trip.end_date,
    rounds,
    scoredRoundIds,
    currentRoundId,
  });

  // ---- News + photos -----------------------------------------------------
  const feedItems = (await buildFeedItems(supabase, trip.id, 4)) ?? [];

  const { data: photosRaw } = await supabase
    .from("photos")
    .select("*")
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const photos = (photosRaw ?? []) as Photo[];
  const photoItems = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from("trip-photos")
        .createSignedUrl(p.storage_path, 60 * 60);
      return { photo: p, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-7">
      {/* Live updates: any score, match, or bet change re-fetches the page
          so the leaderboard preview reflects "USA goes 1 UP" in real time. */}
      <RealtimeRefresh tripId={trip.id} roundIds={rounds.map((r) => r.id)} />

      {/* Hero */}
      <HomeHero
        tripName={trip.name}
        location={trip.location}
        year={trip.year}
        state={heroState}
      />

      {/* Day-by-day course strip */}
      {dayCards.length > 0 && <DayStrip days={dayCards} />}

      {/* Leaderboard preview */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="inline-flex items-center gap-2 font-serif text-xl font-semibold">
            Leaderboard
            <LivePulse />
          </h2>
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {cup
              ? cup.status === "decided" || cup.status === "tie"
                ? "Final · tap for matches"
                : `${cup.pointsRemaining} pts remaining`
              : activeRound
                ? `Day ${activeRound.day_number} — ${FORMAT_LABEL[activeRound.format]}`
                : "See all"}
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {cup ? (
          <Link
            href="/leaderboard"
            className="card flex items-center justify-center gap-3 text-center transition hover:shadow-lift"
          >
            <CupSide name={teams[0]?.name ?? "USA"} points={cup.teamAPoints} highlight={cup.winner === "A"} />
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {cup.status === "decided" ? "Final" : cup.status === "tie" ? "Tied" : "vs"}
            </div>
            <CupSide name={teams[1]?.name ?? "Europe"} points={cup.teamBPoints} highlight={cup.winner === "B"} />
          </Link>
        ) : tickerRows.length > 0 ? (
          <LeaderboardTicker rows={tickerRows} />
        ) : (
          <Link
            href="/leaderboard"
            className="card flex items-center gap-3 text-sm text-muted-foreground transition hover:shadow-lift"
          >
            <Trophy className="h-5 w-5 text-primary" />
            The board lights up as soon as scores start landing.
          </Link>
        )}
      </section>

      {/* News feed */}
      <section className="space-y-2">
        <SectionHead title="Latest" href="/feed" hint="The feed" />
        {feedItems.length > 0 ? (
          <ul className="space-y-2">
            {feedItems.map((it) => {
              const Icon = FEED_ICON[it.type] ?? FEED_ICON.default;
              const color = FEED_COLOR[it.type] ?? "text-muted-foreground";
              return (
                <li key={it.id} className="card flex items-center gap-3 py-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{it.text}</p>
                    {it.hint && <p className="text-[11px] text-muted-foreground">{it.hint}</p>}
                  </div>
                  <time className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {relTime(it.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="card text-sm text-muted-foreground">
            Quiet so far — birdies, leads, and bets will show up here.
          </p>
        )}
      </section>

      {/* Photo reel */}
      <section className="space-y-2">
        <SectionHead title="Photos" href="/photos" hint="The gallery" />
        {photoItems.length > 0 ? (
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {photoItems.map(({ photo, url }) => (
              <li
                key={photo.id}
                className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl border border-line bg-card"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={photo.caption ?? "Trip photo"}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    Loading
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Link
            href="/photos"
            className="card flex items-center gap-3 text-sm text-muted-foreground transition hover:shadow-lift"
          >
            <Camera className="h-5 w-5 text-primary" />
            No photos yet — tap to add the first one.
          </Link>
        )}
      </section>

      {/* Section cards */}
      <section className="grid grid-cols-2 gap-3">
        <NavCard href="/scorecard" Icon={ClipboardList} label="Scorecard" blurb="Post your holes" />
        <NavCard href="/bets" Icon={DollarSign} label="Bets" blurb="Match bets & pots" />
        <NavCard href="/info" Icon={Info} label="Trip info" blurb="Course · lodging · weather" />
        <NavCard href="/format" Icon={BookOpen} label="How it works" blurb="Formats & scoring" />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function computeHeroState(opts: {
  startDate: string | null;
  endDate: string | null;
  rounds: Round[];
  scoredRoundIds: Set<string>;
  currentRoundId: string | null;
}): HeroState {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Trip already complete?
  if (opts.endDate) {
    const end = new Date(opts.endDate + "T23:59:59");
    if (today.getTime() > end.getTime()) return { kind: "complete" };
  }

  // Mid-trip — any scores?
  if (opts.scoredRoundIds.size > 0 && opts.currentRoundId) {
    const r = opts.rounds.find((x) => x.id === opts.currentRoundId);
    if (r) return { kind: "in_progress", dayNumber: r.day_number };
  }

  // Future trip — countdown to start.
  if (opts.startDate) {
    const start = new Date(opts.startDate + "T00:00:00");
    const diff = start.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days > 0) {
      const weekday = start.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      return { kind: "countdown", weekday, days };
    }
  }

  return { kind: "ready" };
}

function formatDateLabel(iso: string): string {
  // "Fri Jun 19" — local-aware, short.
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeLabel(time: string): string {
  // DB stores "HH:MM:SS"; render as "10:10 AM".
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function CupSide({ name, points, highlight }: { name: string; points: number; highlight: boolean }) {
  const display = (() => {
    const whole = Math.trunc(points);
    return Math.abs(points - whole) >= 0.4999 ? `${whole}½` : `${whole}`;
  })();
  return (
    <div className={`flex-1 ${highlight ? "rounded-xl bg-primary/10 py-1.5" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{name}</p>
      <p className="font-serif text-3xl font-semibold tabular-nums">{display}</p>
    </div>
  );
}

function matchPointsFor(
  m: Match,
  rounds: Round[],
  scores: Score[],
  players: Player[],
  courseFor: (r: Round | undefined) => ScCourse
): { team_a_points: number; team_b_points: number } | null {
  const round = rounds.find((r) => r.id === m.round_id);
  if (!round) return null;
  const course = courseFor(round);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const ms = scores.filter((s) => s.match_id === m.id);

  let aPerHole: Map<number, number> | undefined;
  let bPerHole: Map<number, number> | undefined;
  if (round.format === "scramble") {
    const aScores: HoleScore[] = ms.filter((s) => s.team_side === "A").map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const bScores: HoleScore[] = ms.filter((s) => s.team_side === "B").map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const a = playerById.get(m.side_a[0]);
    const b = playerById.get(m.side_a[1] ?? m.side_a[0]);
    const c = playerById.get(m.side_b[0]);
    const d = playerById.get(m.side_b[1] ?? m.side_b[0]);
    const out = scrambleMatchPerHole(
      {
        pair: {
          a: { player_id: a?.id ?? m.side_a[0], index: Number(a?.handicap_index ?? 0) },
          b: { player_id: b?.id ?? m.side_a[1] ?? m.side_a[0], index: Number(b?.handicap_index ?? 0) },
        },
        scores: aScores,
      },
      {
        pair: {
          a: { player_id: c?.id ?? m.side_b[0], index: Number(c?.handicap_index ?? 0) },
          b: { player_id: d?.id ?? m.side_b[1] ?? m.side_b[0], index: Number(d?.handicap_index ?? 0) },
        },
        scores: bScores,
      },
      course
    );
    aPerHole = out.aPerHole;
    bPerHole = out.bPerHole;
  } else if (round.format === "best_ball_bonus") {
    const aBy: Record<string, HoleScore[]> = {};
    const bBy: Record<string, HoleScore[]> = {};
    for (const s of ms) {
      if (!s.player_id) continue;
      const target = m.side_a.includes(s.player_id) ? aBy : bBy;
      (target[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
    }
    const aA = playerById.get(m.side_a[0]);
    const aB = playerById.get(m.side_a[1] ?? m.side_a[0]);
    const bA = playerById.get(m.side_b[0]);
    const bB = playerById.get(m.side_b[1] ?? m.side_b[0]);
    aPerHole = bestBallBonusPerHole(
      {
        pair: {
          a: { player_id: aA?.id ?? m.side_a[0], index: Number(aA?.handicap_index ?? 0) },
          b: { player_id: aB?.id ?? m.side_a[1] ?? m.side_a[0], index: Number(aB?.handicap_index ?? 0) },
        },
        scoresByPlayer: aBy,
      },
      course
    );
    bPerHole = bestBallBonusPerHole(
      {
        pair: {
          a: { player_id: bA?.id ?? m.side_b[0], index: Number(bA?.handicap_index ?? 0) },
          b: { player_id: bB?.id ?? m.side_b[1] ?? m.side_b[0], index: Number(bB?.handicap_index ?? 0) },
        },
        scoresByPlayer: bBy,
      },
      course
    );
  } else {
    const a = playerById.get(m.side_a[0]);
    const b = playerById.get(m.side_b[0]);
    if (!a || !b) return null;
    const aScores = ms.filter((s) => s.player_id === a.id).map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const bScores = ms.filter((s) => s.player_id === b.id).map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    aPerHole = singlesPerHoleNet(Number(a.handicap_index), aScores, course);
    bPerHole = singlesPerHoleNet(Number(b.handicap_index), bScores, course);
  }
  const res = matchResult(runMatchPlay(aPerHole, bPerHole));
  return { team_a_points: res.points.a, team_b_points: res.points.b };
}

function SectionHead({ title, href, hint }: { title: string; href: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {hint ?? "See all"}
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function NavCard({
  href,
  Icon,
  label,
  blurb,
}: {
  href: string;
  Icon: typeof Flag;
  label: string;
  blurb: string;
}) {
  return (
    <Link href={href} className="card flex flex-col gap-2 transition hover:shadow-lift">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{blurb}</div>
      </div>
    </Link>
  );
}

function Brand() {
  return (
    <div className="text-center space-y-3">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
        <Flag className="h-6 w-6" />
      </div>
      <h1 className="font-serif text-4xl font-semibold leading-tight sm:text-5xl">
        The Bobo Golf Trip
      </h1>
    </div>
  );
}

function SignedOutSplash() {
  return (
    <div className="space-y-8 pt-10 pb-12">
      <Brand />
      <div className="flex flex-col items-center gap-2">
        <Link href="/login" className="btn w-full max-w-xs">
          Sign in with magic link
        </Link>
        <Link href="/format" className="btn-ghost w-full max-w-xs">
          How it works
        </Link>
        <p className="text-xs text-muted-foreground">
          Have a join code? Sign in then visit /join/&lt;code&gt;.
        </p>
      </div>

      <ul className="mx-auto grid max-w-md gap-2 text-center text-sm text-muted-foreground">
        <li className="inline-flex items-center justify-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Live leaderboard
        </li>
        <li className="inline-flex items-center justify-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" /> Trip feed
        </li>
        <li className="inline-flex items-center justify-center gap-2">
          <Camera className="h-4 w-4 text-primary" /> Photo gallery
        </li>
      </ul>
    </div>
  );
}
