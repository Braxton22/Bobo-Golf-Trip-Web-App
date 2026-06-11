import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { autoLinkPlayers } from "@/lib/ensure-profile";
import {
  bestBallBonusPerHole,
  computeBirdieBoard,
  computeCupStandings,
  computeRoundLeaderboard,
  computeSkins,
  computeStablefordBoard,
  formatToPar,
  matchResult,
  runMatchPlay,
  scrambleMatchPerHole,
  singlesPerHoleNet,
  toParTone,
  type Course as ScCourse,
  type HoleScore,
} from "@/lib/scoring";
import type { Hole as DBHole, Match, Player, Round, Score, Team } from "@/lib/db";
import { FORMAT_LABEL } from "@/lib/trip-formats";
import { RealtimeRefresh } from "./realtime-refresh";

export default async function LeaderboardPage(props: { searchParams: Promise<{ day?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/leaderboard");
  await autoLinkPlayers();

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
        <p className="text-sm text-muted-foreground">
          Use a join code or create a trip from Admin to get going.
        </p>
      </div>
    );
  }

  // Pull everything we need in parallel.
  const [
    { data: roundsRaw },
    { data: playersRaw },
    { data: teamsRaw },
  ] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id),
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const teams = (teamsRaw ?? []) as Team[];

  // Course holes — assume one course per trip (matches admin flow).
  let holes: DBHole[] = [];
  if (rounds[0]?.course_id) {
    const { data } = await supabase
      .from("holes")
      .select("*")
      .eq("course_id", rounds[0].course_id)
      .order("hole_number");
    holes = (data ?? []) as DBHole[];
  }
  const course: ScCourse = { holes };

  let matches: Match[] = [];
  let allScores: Score[] = [];
  if (rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    const [{ data: mData }, { data: sData }] = await Promise.all([
      supabase.from("matches").select("*").in("round_id", roundIds).order("match_number"),
      supabase.from("scores").select("*").in("round_id", roundIds),
    ]);
    matches = (mData ?? []) as Match[];
    allScores = (sData ?? []) as Score[];
  }

  // Active day defaults to the most recent round that has any score, else day 1.
  const requestedDay = searchParams?.day ? Number(searchParams.day) : null;
  const dayWithScores = rounds.findLast?.((r) => allScores.some((s) => s.round_id === r.id))?.day_number;
  const day = requestedDay ?? dayWithScores ?? rounds[0]?.day_number ?? 1;
  const round = rounds.find((r) => r.day_number === day);

  const isRyder = trip.trip_type === "ryder_cup";

  // Compute Cup standings from all match results across the trip (Ryder only).
  const cup = isRyder
    ? computeCupStandings(
        matches
          .map((m) => computeMatchPoints(m, rounds, allScores, players, course))
          .filter(Boolean) as { team_a_points: number; team_b_points: number; status: string }[],
        {
          pointsToWin: Number(trip.points_to_win),
          totalPoints: trip.total_points,
          tieOutcomeLabel: trip.tie_outcome_label,
        }
      )
    : null;

  const teamA = teams[0];
  const teamB = teams[1];

  return (
    <div className="space-y-6">
      <RealtimeRefresh tripId={trip.id} roundIds={rounds.map((r) => r.id)} />

      <div className="flex justify-end">
        <Link
          href="/format"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          How the format works
        </Link>
      </div>

      {/* Cup standings — Ryder Cup trips only --------------------------- */}
      {cup && (
        <section className="card text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Ryder Cup standings
          </p>
          <div className="grid grid-cols-3 items-end gap-2">
            <TeamScore name={teamA?.name ?? "Team A"} points={cup.teamAPoints} highlight={cup.winner === "A"} />
            <div className="pb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {cup.status === "decided"
                ? "Final"
                : cup.status === "tie"
                  ? "Tied"
                  : `${cup.pointsRemaining} pts remaining`}
            </div>
            <TeamScore name={teamB?.name ?? "Team B"} points={cup.teamBPoints} highlight={cup.winner === "B"} />
          </div>
          <p className="text-xs text-muted-foreground">{cup.scoreline}</p>
          {(cup.status === "decided" || cup.status === "tie") && (
            <Link
              href="/recap"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--gold))]/15 px-3 py-1.5 text-xs font-medium text-[hsl(var(--ink))]"
            >
              <Trophy className="h-3.5 w-3.5" />
              Open the recap →
            </Link>
          )}
        </section>
      )}

      {!isRyder && (
        <header className="text-center space-y-0.5">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Leaderboard</p>
          <h1 className="font-serif text-2xl font-semibold">{trip.name}</h1>
        </header>
      )}

      {/* Count-your-birdies trip race — shown whenever the trip has any
          birdie rounds, since points accumulate across the whole weekend. */}
      {!isRyder && <BirdieTripRace rounds={rounds} allScores={allScores} players={players} course={course} />}

      {/* Day selector -------------------------------------------------- */}
      <nav className="flex flex-wrap gap-2" aria-label="Day selector">
        {rounds.map((r) => {
          const active = r.day_number === day;
          return (
            <Link
              key={r.id}
              href={`/leaderboard?day=${r.day_number}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-line bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Day {r.day_number}
            </Link>
          );
        })}
      </nav>

      {/* Round leaderboard -------------------------------------------- */}
      {round ? (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-semibold">
            Day {round.day_number} — {FORMAT_LABEL[round.format]}
          </h2>

          {round.format === "scramble" || round.format === "best_ball_bonus" ? (
            <TeamMatchList
              round={round}
              matches={matches.filter((m) => m.round_id === round.id)}
              allScores={allScores}
              players={players}
              teams={teams}
              course={course}
            />
          ) : round.format === "singles" || round.format === "match_play" ? (
            <SinglesBoard
              round={round}
              matches={matches.filter((m) => m.round_id === round.id)}
              allScores={allScores}
              players={players}
              course={course}
            />
          ) : round.format === "stableford" ? (
            <StablefordBoardCard round={round} allScores={allScores} players={players} course={course} />
          ) : round.format === "skins" ? (
            <SkinsBoardCard round={round} allScores={allScores} players={players} course={course} />
          ) : round.format === "count_birdies" ? (
            <BirdieRoundBoard
              round={round}
              rounds={rounds}
              allScores={allScores}
              players={players}
              course={course}
            />
          ) : round.format === "group_scramble" ? (
            <GroupBoardCard
              round={round}
              matches={matches.filter((m) => m.round_id === round.id)}
              allScores={allScores}
              players={players}
              course={course}
            />
          ) : null}

          {/* The net stroke-play board reads on any own-ball format. */}
          {round.format !== "scramble" && round.format !== "group_scramble" && round.format !== "skins" && (
            <NetRoundBoard
              round={round}
              allScores={allScores}
              players={players}
              course={course}
            />
          )}
        </section>
      ) : (
        <p className="card text-sm text-muted-foreground">No rounds scheduled.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Casual-format boards
// ---------------------------------------------------------------------------

function soloScoresByPlayer(round: Round, allScores: Score[]): Record<string, HoleScore[]> {
  const out: Record<string, HoleScore[]> = {};
  for (const s of allScores.filter((s) => s.round_id === round.id)) {
    if (!s.player_id) continue;
    (out[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
  }
  return out;
}

function toCasualPlayers(players: Player[]) {
  return players.map((p) => ({ id: p.id, name: p.name, index: Number(p.handicap_index) }));
}

function StablefordBoardCard({
  round,
  allScores,
  players,
  course,
}: {
  round: Round;
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  const rows = computeStablefordBoard(toCasualPlayers(players), soloScoresByPlayer(round, allScores), course);
  if (rows.every((r) => r.thru === 0)) {
    return <EmptyBoard title="Stableford" />;
  }
  return (
    <article className="card">
      <h3 className="font-medium">Stableford points</h3>
      <ul className="mt-2 divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.player_id} className="flex items-center gap-3 py-2">
            <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">
              {r.thru === 0 ? "—" : i + 1}
            </span>
            <span className="flex-1 truncate text-sm">{r.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">thru {r.thru}</span>
            <span className="w-12 text-right font-serif text-lg font-semibold tabular-nums">
              {r.points}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function SkinsBoardCard({
  round,
  allScores,
  players,
  course,
}: {
  round: Round;
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  const res = computeSkins(toCasualPlayers(players), soloScoresByPlayer(round, allScores), course);
  const anyPosted = allScores.some((s) => s.round_id === round.id && s.player_id);
  if (!anyPosted) return <EmptyBoard title="Skins" />;

  return (
    <article className="card space-y-3">
      <header className="flex items-baseline justify-between">
        <h3 className="font-medium">Skins</h3>
        {res.carrying > 0 && (
          <span className="rounded-full bg-[hsl(var(--gold))]/15 px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--ink))]">
            {res.carrying + 1} skins riding on the next hole
          </span>
        )}
      </header>
      <ul className="divide-y divide-line">
        {res.rows.map((r, i) => (
          <li key={r.player_id} className="flex items-center gap-3 py-2">
            <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="flex-1 truncate text-sm">{r.name}</span>
            {r.holesWon.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                holes {r.holesWon.join(", ")}
              </span>
            )}
            <span className="w-12 text-right font-serif text-lg font-semibold tabular-nums">
              {r.skins}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Net skins, ties carry. A hole settles once everyone has posted it.
      </p>
    </article>
  );
}

/** Doubled holes for a count-birdies round: the back nine of the trip's final
 *  count-birdies round ("the last 9 holes of the weekend count double"). */
function birdieDoubledHoles(round: Round, rounds: Round[]): Set<number> {
  const birdieRounds = rounds.filter((r) => r.format === "count_birdies");
  const last = birdieRounds[birdieRounds.length - 1];
  if (!last || last.id !== round.id) return new Set();
  return new Set([10, 11, 12, 13, 14, 15, 16, 17, 18]);
}

function BirdieRoundBoard({
  round,
  rounds,
  allScores,
  players,
  course,
}: {
  round: Round;
  rounds: Round[];
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  const doubled = birdieDoubledHoles(round, rounds);
  const rows = computeBirdieBoard(
    toCasualPlayers(players),
    soloScoresByPlayer(round, allScores),
    course,
    doubled
  );
  if (rows.every((r) => r.thru === 0)) return <EmptyBoard title="Count your birdies" />;
  return (
    <article className="card space-y-2">
      <header className="flex items-baseline justify-between">
        <h3 className="font-medium">Birdie points — this round</h3>
        {doubled.size > 0 && (
          <span className="rounded-full bg-[hsl(var(--gold))]/15 px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--ink))]">
            Back nine counts DOUBLE
          </span>
        )}
      </header>
      <BirdieRows rows={rows} />
    </article>
  );
}

function BirdieTripRace({
  rounds,
  allScores,
  players,
  course,
}: {
  rounds: Round[];
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  const birdieRounds = rounds.filter((r) => r.format === "count_birdies");
  if (birdieRounds.length === 0) return null;

  // Sum per-round boards (each with its own doubling rule) into a trip race.
  const totals = new Map<string, { points: number; birdies: number; eagles: number }>();
  for (const r of birdieRounds) {
    const rows = computeBirdieBoard(
      toCasualPlayers(players),
      soloScoresByPlayer(r, allScores),
      course,
      birdieDoubledHoles(r, rounds)
    );
    for (const row of rows) {
      const t = totals.get(row.player_id) ?? { points: 0, birdies: 0, eagles: 0 };
      t.points += row.points;
      t.birdies += row.birdies;
      t.eagles += row.eagles;
      totals.set(row.player_id, t);
    }
  }
  const rows = players
    .map((p) => ({
      player_id: p.id,
      name: p.name,
      thru: 0,
      ...(totals.get(p.id) ?? { points: 0, birdies: 0, eagles: 0 }),
    }))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name)));

  if (rows.every((r) => r.points === 0)) return null;

  return (
    <article className="card space-y-2">
      <header className="flex items-baseline justify-between">
        <h3 className="font-medium">Birdie race — whole trip</h3>
        <span className="text-[11px] text-muted-foreground">
          birdie 2 · eagle 4 · final back nine ×2
        </span>
      </header>
      <BirdieRows rows={rows} />
    </article>
  );
}

function BirdieRows({
  rows,
}: {
  rows: { player_id: string; name: string; points: number; birdies: number; eagles: number }[];
}) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r, i) => (
        <li key={r.player_id} className="flex items-center gap-3 py-2">
          <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
          <span className="flex-1 truncate text-sm">{r.name}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {r.birdies}🐦{r.eagles > 0 ? ` ${r.eagles}🦅` : ""}
          </span>
          <span className="w-12 text-right font-serif text-lg font-semibold tabular-nums">
            {r.points}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GroupBoardCard({
  round,
  matches,
  allScores,
  players,
  course,
}: {
  round: Round;
  matches: Match[];
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));

  const rows = matches.map((m) => {
    let gross = 0;
    let parPlayed = 0;
    let thru = 0;
    for (const s of allScores) {
      if (s.match_id !== m.id || s.team_side !== "A") continue;
      gross += s.gross;
      parPlayed += parByHole.get(s.hole_number) ?? 4;
      thru += 1;
    }
    return {
      id: m.id,
      number: m.match_number,
      label: m.side_a.map((id) => nameById.get(id) ?? "?").join(", "),
      toPar: thru > 0 ? gross - parPlayed : null,
      gross: thru > 0 ? gross : null,
      thru,
    };
  });
  rows.sort((a, b) => {
    if (a.toPar == null && b.toPar == null) return a.number - b.number;
    if (a.toPar == null) return 1;
    if (b.toPar == null) return -1;
    return a.toPar - b.toPar;
  });

  if (rows.length === 0 || rows.every((r) => r.thru === 0)) return <EmptyBoard title="Scramble" />;

  return (
    <article className="card">
      <h3 className="font-medium">Scramble — group board</h3>
      <ul className="mt-2 divide-y divide-line">
        {rows.map((r, i) => {
          const tone = toParTone(r.toPar);
          const color =
            tone === "under"
              ? "text-[hsl(var(--score-under))]"
              : tone === "over"
                ? "text-foreground"
                : "text-muted-foreground";
          return (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">
                {r.thru === 0 ? "—" : i + 1}
              </span>
              <span className="flex-1 truncate text-sm">{r.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">thru {r.thru}</span>
              <span className={`w-12 text-right font-serif text-lg font-semibold tabular-nums ${color}`}>
                {formatToPar(r.toPar)}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function EmptyBoard({ title }: { title: string }) {
  return (
    <article className="card">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">No scores posted yet.</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function TeamScore({ name, points, highlight }: { name: string; points: number; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl bg-primary/10 p-2" : ""}>
      <p className="text-xs text-muted-foreground">{name}</p>
      <p className="font-serif text-4xl font-semibold tabular-nums">{fmtHalf(points)}</p>
    </div>
  );
}

function fmtHalf(n: number): string {
  const whole = Math.trunc(n);
  const half = Math.abs(n - whole) >= 0.4999;
  return half ? `${whole}½` : `${whole}`;
}

function NetRoundBoard({
  round,
  allScores,
  players,
  course,
}: {
  round: Round;
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  // Aggregate all scores for this round per player (incl. team-scramble scores
  // which we attribute to all members of the side they entered for).
  const scoresByPlayer: Record<string, HoleScore[]> = {};
  for (const s of allScores.filter((s) => s.round_id === round.id)) {
    if (!s.player_id) continue;
    (scoresByPlayer[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
  }

  const rows = computeRoundLeaderboard(
    players.map((p) => ({ id: p.id, name: p.name, index: Number(p.handicap_index) })),
    scoresByPlayer,
    course
  );

  if (rows.every((r) => r.thru === 0)) {
    return (
      <article className="card">
        <h3 className="font-medium">Net round board</h3>
        <p className="mt-1 text-sm text-muted-foreground">No scores posted yet.</p>
      </article>
    );
  }

  return (
    <article className="card">
      <h3 className="font-medium">Net round board</h3>
      <ul className="mt-2 divide-y divide-line">
        {rows.map((r, i) => {
          const tone = toParTone(r.toPar);
          const color =
            tone === "under"
              ? "text-[hsl(var(--score-under))]"
              : tone === "over"
                ? "text-foreground"
                : "text-muted-foreground";
          return (
            <li key={r.player_id} className="flex items-center gap-3 py-2">
              <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">
                {r.thru === 0 ? "—" : i + 1}
              </span>
              <span className="flex-1 truncate text-sm">{r.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">thru {r.thru}</span>
              <span className={`w-12 text-right font-serif text-lg font-semibold tabular-nums ${color}`}>
                {formatToPar(r.toPar)}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function TeamMatchList({
  round,
  matches,
  allScores,
  players,
  teams,
  course,
}: {
  round: Round;
  matches: Match[];
  allScores: Score[];
  players: Player[];
  teams: Team[];
  course: ScCourse;
}) {
  const playerById = new Map(players.map((p) => [p.id, p]));
  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const pts = computeMatchPoints(m, [round], allScores, players, course);
        const a = m.side_a.map((id) => playerById.get(id)?.name).filter(Boolean).join(" & ");
        const b = m.side_b.map((id) => playerById.get(id)?.name).filter(Boolean).join(" & ");
        const teamA = teams.find((t) => t.id === m.team_a_id);
        const teamB = teams.find((t) => t.id === m.team_b_id);
        return (
          <li key={m.id} className="card space-y-2">
            <header className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Match {m.match_number}
              </span>
              <span className="font-serif text-sm font-semibold">
                {pts?.scoreline ?? "—"}
              </span>
            </header>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{a || "—"}</p>
                {teamA?.name && (
                  <p className="text-[11px] text-muted-foreground truncate">{teamA.name}</p>
                )}
                <NetChip net={pts?.sideA} />
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">vs</span>
              <div className="min-w-0 text-right">
                <p className="truncate font-medium">{b || "—"}</p>
                {teamB?.name && (
                  <p className="text-[11px] text-muted-foreground truncate">{teamB.name}</p>
                )}
                <NetChip net={pts?.sideB} alignRight />
              </div>
            </div>
          </li>
        );
      })}
      {matches.length === 0 && (
        <li className="text-sm text-muted-foreground">No matches scheduled.</li>
      )}
    </ul>
  );
}

function NetChip({ net, alignRight = false }: { net?: SideNet; alignRight?: boolean }) {
  if (!net || net.thru === 0) {
    return (
      <p className={`text-[11px] text-muted-foreground tabular-nums ${alignRight ? "text-right" : ""}`}>
        —
      </p>
    );
  }
  const tone = toParTone(net.toPar);
  const color =
    tone === "under"
      ? "text-[hsl(var(--score-under))]"
      : tone === "over"
        ? "text-foreground"
        : "text-muted-foreground";
  return (
    <p className={`tabular-nums text-xs ${alignRight ? "text-right" : ""}`}>
      <span className={`font-semibold ${color}`}>{formatToPar(net.toPar)}</span>
      <span className="text-muted-foreground"> · thru {net.thru}</span>
    </p>
  );
}

function SinglesBoard({
  round,
  matches,
  allScores,
  players,
  course,
}: {
  round: Round;
  matches: Match[];
  allScores: Score[];
  players: Player[];
  course: ScCourse;
}) {
  return (
    <TeamMatchList round={round} matches={matches} allScores={allScores} players={players} teams={[]} course={course} />
  );
}

// ---------------------------------------------------------------------------
// Match-points computation — pulls the right per-hole scores and runs the
// scoring engine for the right format.
// ---------------------------------------------------------------------------

type SideNet = { toPar: number | null; thru: number };
type MatchPoints = {
  team_a_points: number;
  team_b_points: number;
  status: string;
  scoreline: string;
  sideA: SideNet;
  sideB: SideNet;
};

/** Sum a per-hole net map against par-played to get net-to-par. */
function netToPar(perHole: Map<number, number>, course: ScCourse): SideNet {
  if (perHole.size === 0) return { toPar: null, thru: 0 };
  let net = 0;
  let par = 0;
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));
  for (const [hn, v] of perHole) {
    net += v;
    par += parByHole.get(hn) ?? 4;
  }
  return { toPar: net - par, thru: perHole.size };
}

function computeMatchPoints(
  match: Match,
  rounds: Round[],
  allScores: Score[],
  players: Player[],
  course: ScCourse
): MatchPoints | null {
  const round = rounds.find((r) => r.id === match.round_id);
  if (!round) return null;
  const playerById = new Map(players.map((p) => [p.id, p]));

  const matchScores = allScores.filter((s) => s.match_id === match.id);

  if (round.format === "scramble") {
    const aScores: HoleScore[] = matchScores
      .filter((s) => s.team_side === "A")
      .map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const bScores: HoleScore[] = matchScores
      .filter((s) => s.team_side === "B")
      .map((s) => ({ hole_number: s.hole_number, gross: s.gross }));

    const sideA = { pair: makePair(match.side_a, playerById), scores: aScores };
    const sideB = { pair: makePair(match.side_b, playerById), scores: bScores };
    const { aPerHole, bPerHole } = scrambleMatchPerHole(sideA, sideB, course);
    const prog = runMatchPlay(aPerHole, bPerHole);
    const res = matchResult(prog);
    return {
      team_a_points: res.points.a,
      team_b_points: res.points.b,
      status: res.status,
      scoreline: res.scoreline,
      sideA: netToPar(aPerHole, course),
      sideB: netToPar(bPerHole, course),
    };
  }

  if (round.format === "best_ball_bonus") {
    const aPerPlayer: Record<string, HoleScore[]> = {};
    const bPerPlayer: Record<string, HoleScore[]> = {};
    for (const s of matchScores) {
      if (!s.player_id) continue;
      const target = match.side_a.includes(s.player_id) ? aPerPlayer : bPerPlayer;
      (target[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
    }
    const aPerHole = bestBallBonusPerHole(
      { pair: makePair(match.side_a, playerById), scoresByPlayer: aPerPlayer },
      course
    );
    const bPerHole = bestBallBonusPerHole(
      { pair: makePair(match.side_b, playerById), scoresByPlayer: bPerPlayer },
      course
    );
    const prog = runMatchPlay(aPerHole, bPerHole);
    const res = matchResult(prog);
    return {
      team_a_points: res.points.a,
      team_b_points: res.points.b,
      status: res.status,
      scoreline: res.scoreline,
      sideA: netToPar(aPerHole, course),
      sideB: netToPar(bPerHole, course),
    };
  }

  // Singles
  const a = playerById.get(match.side_a[0]);
  const b = playerById.get(match.side_b[0]);
  if (!a || !b) return null;
  const aScores = matchScores
    .filter((s) => s.player_id === a.id)
    .map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
  const bScores = matchScores
    .filter((s) => s.player_id === b.id)
    .map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
  const aPerHole = singlesPerHoleNet(Number(a.handicap_index), aScores, course);
  const bPerHole = singlesPerHoleNet(Number(b.handicap_index), bScores, course);
  const prog = runMatchPlay(aPerHole, bPerHole);
  const res = matchResult(prog);
  return {
    team_a_points: res.points.a,
    team_b_points: res.points.b,
    status: res.status,
    scoreline: res.scoreline,
    sideA: netToPar(aPerHole, course),
    sideB: netToPar(bPerHole, course),
  };
}

function makePair(ids: string[], by: Map<string, Player>) {
  // For singles we still wrap the single player into the pair shape since
  // scrambleMatchPerHole/bestBallBonusPerHole don't get called for singles.
  const a = by.get(ids[0]);
  const b = by.get(ids[1] ?? ids[0]);
  return {
    a: { player_id: a?.id ?? ids[0], index: Number(a?.handicap_index ?? 0) },
    b: { player_id: b?.id ?? (ids[1] ?? ids[0]), index: Number(b?.handicap_index ?? 0) },
  };
}
