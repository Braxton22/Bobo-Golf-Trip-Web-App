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
  computeRoundLeaderboard,
  formatToPar,
  toParTone,
  type Course as ScCourse,
  type HoleScore,
} from "@/lib/scoring";
import { FORMAT_LABEL } from "@/lib/trip-formats";
import type { Hole, Photo, Player, Round, Score } from "@/lib/db";
import { LeaderboardTicker, type TickerRow } from "@/components/home/leaderboard-ticker";

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

  // ---- Rolling leaderboard: the active round's net board ------------------
  const [{ data: roundsRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];

  let scores: Score[] = [];
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("scores")
      .select("*")
      .in("round_id", rounds.map((r) => r.id));
    scores = (data ?? []) as Score[];
  }

  // Active round = most recent round that has any score, else the first.
  const activeRound =
    [...rounds].reverse().find((r) => scores.some((s) => s.round_id === r.id)) ?? rounds[0] ?? null;

  let holes: Hole[] = [];
  if (activeRound?.course_id) {
    const { data } = await supabase
      .from("holes")
      .select("*")
      .eq("course_id", activeRound.course_id)
      .order("hole_number");
    holes = (data ?? []) as Hole[];
  }
  const course: ScCourse = { holes };

  let tickerRows: TickerRow[] = [];
  if (activeRound && holes.length > 0) {
    const scoresByPlayer: Record<string, HoleScore[]> = {};
    for (const s of scores.filter((s) => s.round_id === activeRound.id)) {
      if (!s.player_id) continue;
      (scoresByPlayer[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
    }
    const board = computeRoundLeaderboard(
      players.map((p) => ({ id: p.id, name: p.name, index: Number(p.handicap_index) })),
      scoresByPlayer,
      course
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
      {/* Title */}
      <header className="space-y-0.5">
        <h1 className="font-serif text-3xl font-semibold leading-tight">{trip.name}</h1>
        <p className="text-sm text-muted-foreground">
          {trip.location ? `${trip.location} · ` : ""}
          {trip.year}
        </p>
      </header>

      {/* Rolling leaderboard */}
      <section className="space-y-2">
        <SectionHead
          title="Leaderboard"
          href="/leaderboard"
          hint={activeRound ? `Day ${activeRound.day_number} — ${FORMAT_LABEL[activeRound.format]}` : undefined}
        />
        {tickerRows.length > 0 ? (
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
      {photoItems.length > 0 && (
        <section className="space-y-2">
          <SectionHead title="Photos" href="/photos" hint="The gallery" />
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
        </section>
      )}

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
