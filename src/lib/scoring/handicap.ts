import type { Course, Hole, HandicapMode, PlayerHandicap, ScrambleAllowance } from "./types";

/**
 * Course handicap — how many strokes a player receives across the round.
 *
 *   simple: round(Index)
 *   slope:  round(Index * Slope/113 + (Rating - Par))   // off by default
 *
 * Negative results are clamped to 0 (a +handicap plays scratch in match play
 * for our purposes; future enhancement could give strokes back to the field).
 */
export function courseHandicap(
  player: PlayerHandicap,
  course: Course,
  mode: HandicapMode = "simple"
): number {
  if (mode === "slope") {
    const slope = player.slope ?? course.slope ?? 113;
    const rating = player.rating ?? course.rating ?? course.par ?? 72;
    const par = player.par ?? course.par ?? 72;
    const raw = player.index * (slope / 113) + (rating - par);
    return Math.max(0, Math.round(raw));
  }
  return Math.max(0, Math.round(player.index));
}

/**
 * Allocate N strokes to the 18 holes by stroke index.
 *
 *   - 1 stroke on every hole whose stroke_index <= N
 *   - 2nd stroke on every hole whose stroke_index <= (N - 18) when N > 18
 *   - 3rd stroke when N > 36, etc.
 *
 * Returns a map of hole_number -> strokes received on that hole.
 */
export function allocateStrokes(strokes: number, holes: Hole[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const h of holes) out.set(h.hole_number, 0);
  if (strokes <= 0) return out;

  let remaining = strokes;
  let tier = 1;
  while (remaining > 0) {
    const cutoff = Math.min(18, remaining);
    for (const h of holes) {
      if (h.stroke_index <= cutoff) {
        out.set(h.hole_number, (out.get(h.hole_number) ?? 0) + 1);
      }
    }
    remaining -= 18;
    tier += 1;
    // Safety: cap absurd indices so we never loop forever.
    if (tier > 5) break;
  }
  return out;
}

/**
 * Net score for a single hole given a gross score and the strokes received.
 */
export function netHole(gross: number, strokesReceived: number): number {
  return gross - strokesReceived;
}

/**
 * Scramble team handicap (Day 1).
 *
 *   teamCH = round( low% * round(lowerIndex) + high% * round(higherIndex) )
 *
 * Defaults follow the spec: 35% low + 15% high. The two competing teams play
 * off the DIFFERENCE between their team handicaps (lower team plays scratch,
 * higher team gets the difference, allocated by stroke index).
 */
export function scrambleTeamHandicap(
  partnerAIndex: number,
  partnerBIndex: number,
  allowance: ScrambleAllowance = { low: 0.35, high: 0.15 }
): number {
  const a = Math.round(partnerAIndex);
  const b = Math.round(partnerBIndex);
  const lower = Math.min(a, b);
  const higher = Math.max(a, b);
  return Math.max(0, Math.round(allowance.low * lower + allowance.high * higher));
}
