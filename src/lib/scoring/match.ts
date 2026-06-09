import type { HoleResult, MatchProgress, MatchSideResult } from "./types";

/**
 * Drive a match-play comparison given per-hole scores for sides A and B.
 *
 * Pass scores as Maps keyed by hole_number. Holes missing from EITHER map are
 * skipped (the hole hasn't been played yet). totalHoles defaults to 18 so the
 * "thru" count and the "& X to go" math line up with a real round.
 */
export function runMatchPlay(
  aPerHole: Map<number, number>,
  bPerHole: Map<number, number>,
  totalHoles = 18
): MatchProgress {
  const played: { hole_number: number; aTeamScore: number; bTeamScore: number; result: HoleResult; upDownAfter: number }[] = [];

  let upDown = 0; // + = A up
  let decided: MatchProgress["decided"] = null;

  // Walk holes in numeric order. Both sides must have a score for the hole to count.
  const allHoles = new Set<number>([...aPerHole.keys(), ...bPerHole.keys()]);
  const inOrder = Array.from(allHoles).sort((x, y) => x - y);

  for (const hole of inOrder) {
    if (decided) break;
    const a = aPerHole.get(hole);
    const b = bPerHole.get(hole);
    if (a == null || b == null) continue;

    let result: HoleResult;
    if (a < b) {
      result = "A";
      upDown += 1;
    } else if (b < a) {
      result = "B";
      upDown -= 1;
    } else {
      result = "halve";
    }

    played.push({ hole_number: hole, aTeamScore: a, bTeamScore: b, result, upDownAfter: upDown });

    const holesRemaining = totalHoles - played.length;
    if (Math.abs(upDown) > holesRemaining) {
      // Match decided early — e.g. "3 & 2" when up 3 with 2 to go.
      decided = {
        winner: upDown > 0 ? "A" : "B",
        margin: { up: Math.abs(upDown), toGo: holesRemaining },
      };
    } else if (played.length === totalHoles) {
      // All 18 holes played.
      decided =
        upDown === 0
          ? { winner: "halve" }
          : { winner: upDown > 0 ? "A" : "B", margin: { up: Math.abs(upDown), toGo: 0 } };
    }
  }

  return {
    upDown,
    thru: played.length,
    holesRemaining: totalHoles - played.length,
    decided,
    holes: played,
  };
}

/**
 * Convert a MatchProgress into the points/status/scoreline that the leaderboard
 * cares about. Match-play points: win = 1, halve = 0.5 each, loss = 0.
 */
export function matchResult(progress: MatchProgress): MatchSideResult {
  if (progress.decided) {
    const w = progress.decided.winner;
    if (w === "halve") {
      return { points: { a: 0.5, b: 0.5 }, status: "complete", scoreline: "AS" };
    }
    const margin = progress.decided.margin;
    const scoreline = margin
      ? margin.toGo === 0
        ? `${margin.up} UP`
        : `${margin.up} & ${margin.toGo}`
      : w === "A"
        ? "A wins"
        : "B wins";
    return {
      points: w === "A" ? { a: 1, b: 0 } : { a: 0, b: 1 },
      status: "complete",
      scoreline,
    };
  }

  // In progress — provisional scoreline.
  if (progress.thru === 0) {
    return { points: { a: 0, b: 0 }, status: "in_progress", scoreline: "—" };
  }
  if (progress.upDown === 0) {
    return { points: { a: 0, b: 0 }, status: "in_progress", scoreline: `AS thru ${progress.thru}` };
  }
  const side = progress.upDown > 0 ? "A" : "B";
  return {
    points: { a: 0, b: 0 },
    status: "in_progress",
    scoreline: `${side} ${Math.abs(progress.upDown)} UP thru ${progress.thru}`,
  };
}
