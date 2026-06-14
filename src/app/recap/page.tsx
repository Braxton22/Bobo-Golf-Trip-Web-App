import { redirect } from "next/navigation";
import Link from "next/link";
import { Award, Coins, Flag, Star, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Hole, Match, MatchBet, Player, Round, Score, Team } from "@/lib/db";
import {
  bestBallBonusPerHole,
  computeCupStandings,
  matchResult,
  runMatchPlay,
  scrambleMatchPerHole,
  singlesPerHoleNet,
  type HoleScore,
  type Course as ScCourse,
} from "@/lib/scoring";
import { ShareRecap } from "./share";

export default async function RecapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/recap");

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
      </div>
    );
  }
  // The recap page is Ryder-Cup-shaped (MVP by match points, Cup standings,
  // team winner). Casual trips just go back to the leaderboard for now.
  if (trip.trip_type !== "ryder_cup") redirect("/leaderboard");

  // Load everything in one fan-out.
  const [
    { data: roundsRaw },
    { data: playersRaw },
    { data: teamsRaw },
    { data: betsRaw },
  ] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id),
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("match_bets").select("*").eq("trip_id", trip.id),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const teams = (teamsRaw ?? []) as Team[];
  const matchBets = (betsRaw ?? []) as MatchBet[];

  let matches: Match[] = [];
  let scores: Score[] = [];
  let allHoles: Hole[] = [];
  if (rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[];
    const [{ data: m }, { data: s }, { data: h }] = await Promise.all([
      supabase.from("matches").select("*").in("round_id", roundIds),
      supabase.from("scores").select("*").in("round_id", roundIds),
      courseIds.length > 0
        ? supabase.from("holes").select("*").in("course_id", courseIds).order("hole_number")
        : Promise.resolve({ data: [] as Hole[] }),
    ]);
    matches = (m ?? []) as Match[];
    scores = (s ?? []) as Score[];
    allHoles = (h ?? []) as Hole[];
  }
  const holesByCourse = new Map<string, Hole[]>();
  for (const h of allHoles) {
    (holesByCourse.get(h.course_id) ?? holesByCourse.set(h.course_id, []).get(h.course_id)!).push(h);
  }
  const courseFor = (r: Round | undefined): ScCourse => ({
    holes: r?.course_id ? holesByCourse.get(r.course_id) ?? [] : [],
  });
  const roundById = new Map(rounds.map((r) => [r.id, r]));

  // Cup standings.
  const matchPts = matches
    .map((m) => matchPointsFor(m, rounds, scores, players, courseFor(roundById.get(m.round_id))))
    .filter(Boolean) as {
    match: Match;
    team_a_points: number;
    team_b_points: number;
    scoreline: string;
  }[];
  const cup = computeCupStandings(
    matchPts.map((m) => ({ team_a_points: m.team_a_points, team_b_points: m.team_b_points })),
    {
      pointsToWin: Number(trip.points_to_win),
      totalPoints: trip.total_points,
      tieOutcomeLabel: trip.tie_outcome_label,
    }
  );

  // MVP — most individual match points across the trip; tiebreak by best single-round net.
  const pointsByPlayer = new Map<string, number>();
  for (const mp of matchPts) {
    const m = mp.match;
    for (const id of m.side_a) pointsByPlayer.set(id, (pointsByPlayer.get(id) ?? 0) + mp.team_a_points);
    for (const id of m.side_b) pointsByPlayer.set(id, (pointsByPlayer.get(id) ?? 0) + mp.team_b_points);
  }
  const playerNetByRound = new Map<string, Map<string, number>>();
  for (const p of players) {
    const byRound = new Map<string, number>();
    for (const r of rounds) {
      const sn = scores.filter((s) => s.round_id === r.id && s.player_id === p.id);
      if (sn.length === 0) continue;
      const roundCourse = courseFor(r);
      const grosses: HoleScore[] = sn.map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
      const net = singlesPerHoleNet(Number(p.handicap_index), grosses, roundCourse);
      let total = 0;
      net.forEach((v) => (total += v));
      const parPlayed = sn.reduce(
        (a, s) => a + (roundCourse.holes.find((h) => h.hole_number === s.hole_number)?.par ?? 4),
        0
      );
      byRound.set(r.id, total - parPlayed);
    }
    playerNetByRound.set(p.id, byRound);
  }

  const ranked = [...pointsByPlayer.entries()].sort(([aId, aPts], [bId, bPts]) => {
    if (aPts !== bPts) return bPts - aPts;
    const aBest = Math.min(...[...(playerNetByRound.get(aId)?.values() ?? [0])]);
    const bBest = Math.min(...[...(playerNetByRound.get(bId)?.values() ?? [0])]);
    return aBest - bBest;
  });
  const mvpId = ranked[0]?.[0];
  const mvp = mvpId ? players.find((p) => p.id === mvpId) : null;
  const mvpPoints = mvpId ? pointsByPlayer.get(mvpId) ?? 0 : 0;

  // Biggest bet winner — net cash from settled match bets.
  const cashByPlayer = new Map<string, number>();
  for (const bet of matchBets) {
    if (!bet.taker_player_id) continue;
    if (bet.outcome !== "placer" && bet.outcome !== "taker") continue;
    const amount = Number(bet.amount);
    const winnerId = bet.outcome === "placer" ? bet.placer_player_id : bet.taker_player_id;
    const loserId = bet.outcome === "placer" ? bet.taker_player_id : bet.placer_player_id;
    cashByPlayer.set(winnerId, (cashByPlayer.get(winnerId) ?? 0) + amount);
    cashByPlayer.set(loserId, (cashByPlayer.get(loserId) ?? 0) - amount);
  }
  const richest = [...cashByPlayer.entries()].sort(([, a], [, b]) => b - a)[0];
  const bigWinner = richest ? { player: players.find((p) => p.id === richest[0]), amount: richest[1] } : null;

  // Lowest net round across the trip.
  let lowestNet: { player: Player; toPar: number; roundId: string } | null = null;
  for (const [pId, byRound] of playerNetByRound) {
    for (const [rId, toPar] of byRound) {
      if (lowestNet == null || toPar < lowestNet.toPar) {
        const player = players.find((p) => p.id === pId);
        if (player) lowestNet = { player, toPar, roundId: rId };
      }
    }
  }

  // Most birdies-or-better. Par is per the score's round's course.
  const birdiesByPlayer = new Map<string, number>();
  const parByCourseHole = new Map<string, number>();
  for (const h of allHoles) parByCourseHole.set(`${h.course_id}|${h.hole_number}`, h.par);
  for (const s of scores) {
    if (!s.player_id) continue;
    const courseId = roundById.get(s.round_id)?.course_id;
    if (!courseId) continue;
    const par = parByCourseHole.get(`${courseId}|${s.hole_number}`);
    if (!par) continue;
    if (s.gross <= par - 1) {
      birdiesByPlayer.set(s.player_id, (birdiesByPlayer.get(s.player_id) ?? 0) + 1);
    }
  }
  const mostBirdies = [...birdiesByPlayer.entries()].sort(([, a], [, b]) => b - a)[0];

  const teamA = teams[0];
  const teamB = teams[1];
  const winnerName =
    cup.winner === "A" ? teamA?.name : cup.winner === "B" ? teamB?.name : cup.winner === "tie" ? trip.tie_outcome_label : null;

  return (
    <div className="space-y-5">
      <header className="card text-center space-y-2">
        <Trophy className="mx-auto h-7 w-7 text-[hsl(var(--gold))]" />
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {trip.name} · {trip.year}
        </p>
        <h1 className="font-serif text-3xl font-semibold">
          {cup.status === "decided" || cup.status === "tie" ? "The Cup is Decided" : "Trip Recap"}
        </h1>
        <p className="font-serif text-4xl font-semibold tabular-nums">{cup.scoreline}</p>
        {winnerName && (
          <p className="text-sm text-muted-foreground">
            {cup.status === "decided" ? "Champions: " : ""}
            <span className="font-medium text-foreground">{winnerName}</span>
          </p>
        )}
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        <Stat
          icon={Star}
          label="MVP"
          headline={mvp?.name ?? "—"}
          detail={mvp ? `${mvpPoints} match pts` : ""}
        />
        <Stat
          icon={Flag}
          label="Lowest net round"
          headline={lowestNet ? lowestNet.player.name : "—"}
          detail={lowestNet ? `${lowestNet.toPar > 0 ? "+" : ""}${lowestNet.toPar} to par` : ""}
        />
        <Stat
          icon={Award}
          label="Most birdies+"
          headline={mostBirdies ? players.find((p) => p.id === mostBirdies[0])?.name ?? "—" : "—"}
          detail={mostBirdies ? `${mostBirdies[1]} birdies or better` : ""}
        />
        <Stat
          icon={Coins}
          label="Biggest bet winner"
          headline={bigWinner?.player?.name ?? "—"}
          detail={
            bigWinner
              ? `${bigWinner.amount >= 0 ? "+" : "-"}$${Math.abs(bigWinner.amount).toFixed(2)} net`
              : "no settled bets"
          }
        />
      </ul>

      <ShareRecap
        title={`${trip.name} ${trip.year}: ${cup.scoreline}`}
        text={
          winnerName
            ? `${winnerName} took it ${cup.scoreline}. MVP: ${mvp?.name ?? "—"}.`
            : `Final: ${cup.scoreline}.`
        }
      />

      <Link href="/leaderboard" className="btn-ghost w-full inline-flex justify-center">
        Back to leaderboard
      </Link>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  headline,
  detail,
}: {
  icon: typeof Star;
  label: string;
  headline: string;
  detail: string;
}) {
  return (
    <li className="card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 font-serif text-xl font-semibold">{headline}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </li>
  );
}

function matchPointsFor(
  match: Match,
  rounds: Round[],
  allScores: Score[],
  players: Player[],
  course: ScCourse
): { match: Match; team_a_points: number; team_b_points: number; scoreline: string } | null {
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
    const res = matchResult(runMatchPlay(aPerHole, bPerHole));
    return { match, team_a_points: res.points.a, team_b_points: res.points.b, scoreline: res.scoreline };
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
    const res = matchResult(runMatchPlay(aPerHole, bPerHole));
    return { match, team_a_points: res.points.a, team_b_points: res.points.b, scoreline: res.scoreline };
  }
  const a = playerById.get(match.side_a[0]);
  const b = playerById.get(match.side_b[0]);
  if (!a || !b) return null;
  const aScores = matchScores.filter((s) => s.player_id === a.id).map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
  const bScores = matchScores.filter((s) => s.player_id === b.id).map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
  const aPerHole = singlesPerHoleNet(Number(a.handicap_index), aScores, course);
  const bPerHole = singlesPerHoleNet(Number(b.handicap_index), bScores, course);
  const res = matchResult(runMatchPlay(aPerHole, bPerHole));
  return { match, team_a_points: res.points.a, team_b_points: res.points.b, scoreline: res.scoreline };
}

function makePair(ids: string[], by: Map<string, Player>) {
  const a = by.get(ids[0]);
  const b = by.get(ids[1] ?? ids[0]);
  return {
    a: { player_id: a?.id ?? ids[0], index: Number(a?.handicap_index ?? 0) },
    b: { player_id: b?.id ?? (ids[1] ?? ids[0]), index: Number(b?.handicap_index ?? 0) },
  };
}
