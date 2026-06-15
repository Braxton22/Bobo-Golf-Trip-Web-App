import { allocateStrokes, courseHandicap, scrambleTeamHandicap } from "./handicap";
import type { Course, HandicapMode, HoleScore, Pair, ScrambleAllowance } from "./types";

// ---------------------------------------------------------------------------
// SINGLES (Day 3)
// ---------------------------------------------------------------------------
// Each player gets their FULL simple-mode strokes, allocated by stroke index.
// We return the per-hole net for the player; the match layer compares two of
// these per-hole.
// ---------------------------------------------------------------------------

export function singlesPerHoleNet(
  playerIndex: number,
  scores: HoleScore[],
  course: Course,
  mode: HandicapMode = "simple"
): Map<number, number> {
  const ch = courseHandicap({ index: playerIndex }, course, mode);
  const strokes = allocateStrokes(ch, course.holes);
  const out = new Map<number, number>();
  for (const s of scores) {
    out.set(s.hole_number, s.gross - (strokes.get(s.hole_number) ?? 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// SCRAMBLE (Day 1)
// ---------------------------------------------------------------------------
// Teams enter ONE gross per hole. Each team's "course handicap" =
// round(0.35 × lower partner's index + 0.15 × higher partner's index), and
// EACH team plays off its OWN handicap — full strokes allocated by stroke
// index. (Previously the match played off the difference; now both sides take
// their own strokes.) Result = per-hole net for each side.
// ---------------------------------------------------------------------------

export type ScrambleSide = {
  pair: Pair;
  scores: HoleScore[]; // one entry per hole played, team gross
};

export function scrambleMatchPerHole(
  sideA: ScrambleSide,
  sideB: ScrambleSide,
  course: Course,
  allowance: ScrambleAllowance = { low: 0.35, high: 0.15 }
): {
  aPerHole: Map<number, number>;
  bPerHole: Map<number, number>;
  aTeamHandicap: number;
  bTeamHandicap: number;
} {
  const aH = scrambleTeamHandicap(sideA.pair.a.index, sideA.pair.b.index, allowance);
  const bH = scrambleTeamHandicap(sideB.pair.a.index, sideB.pair.b.index, allowance);

  // Each team gets its OWN handicap allocated by stroke index.
  const aStrokes = allocateStrokes(aH, course.holes);
  const bStrokes = allocateStrokes(bH, course.holes);

  const aPerHole = new Map<number, number>();
  for (const s of sideA.scores) {
    aPerHole.set(s.hole_number, s.gross - (aStrokes.get(s.hole_number) ?? 0));
  }
  const bPerHole = new Map<number, number>();
  for (const s of sideB.scores) {
    bPerHole.set(s.hole_number, s.gross - (bStrokes.get(s.hole_number) ?? 0));
  }

  return { aPerHole, bPerHole, aTeamHandicap: aH, bTeamHandicap: bH };
}

// ---------------------------------------------------------------------------
// BEST BALL + BONUS (Day 2)
// ---------------------------------------------------------------------------
// Each partner plays their own ball; each gets their FULL simple-mode strokes
// by stroke index. For each hole:
//
//   teamHole = min(aNet, bNet)                          // best ball
//   if (aNet <= par && bNet <= par)   teamHole -= 1     // BOTH net par-or-better
//
// teamHole is what's compared head-to-head for that hole. We return per-hole
// team scores for both sides so the match layer can drive match play.
// ---------------------------------------------------------------------------

export type BestBallSide = {
  pair: Pair;
  // Per-partner per-hole gross scores. Each partner is identified by player_id.
  scoresByPlayer: Record<string, HoleScore[]>;
};

export function bestBallBonusPerHole(
  side: BestBallSide,
  course: Course,
  mode: HandicapMode = "simple"
): Map<number, number> {
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));

  const aCH = courseHandicap({ index: side.pair.a.index }, course, mode);
  const bCH = courseHandicap({ index: side.pair.b.index }, course, mode);
  const aStrokes = allocateStrokes(aCH, course.holes);
  const bStrokes = allocateStrokes(bCH, course.holes);

  const aScores = side.scoresByPlayer[side.pair.a.player_id] ?? [];
  const bScores = side.scoresByPlayer[side.pair.b.player_id] ?? [];
  const aByHole = new Map(aScores.map((s) => [s.hole_number, s.gross]));
  const bByHole = new Map(bScores.map((s) => [s.hole_number, s.gross]));

  const out = new Map<number, number>();
  // Iterate by holes 1..18 so the order is deterministic.
  for (const h of course.holes) {
    const aGross = aByHole.get(h.hole_number);
    const bGross = bByHole.get(h.hole_number);
    if (aGross == null && bGross == null) continue;

    const aNet = aGross != null ? aGross - (aStrokes.get(h.hole_number) ?? 0) : Number.POSITIVE_INFINITY;
    const bNet = bGross != null ? bGross - (bStrokes.get(h.hole_number) ?? 0) : Number.POSITIVE_INFINITY;

    let team = Math.min(aNet, bNet);
    const par = parByHole.get(h.hole_number) ?? 4;
    // Bonus stroke ONLY if both partners played AND both made net par-or-better.
    if (aGross != null && bGross != null && aNet <= par && bNet <= par) {
      team -= 1;
    }
    out.set(h.hole_number, team);
  }
  return out;
}
