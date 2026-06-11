import { allocateStrokes, courseHandicap } from "./handicap";
import type { Course, HoleScore } from "./types";

// ---------------------------------------------------------------------------
// Casual-trip formats: Stableford, Skins, Count-your-birdies, group scramble.
// All pure functions over the same (players, scoresByPlayer, course) inputs
// the net round board already uses.
// ---------------------------------------------------------------------------

export type CasualPlayer = { id: string; name: string; index: number };

/** Stableford points for one hole, from net score relative to par. */
export function stablefordPoints(netRelativeToPar: number): number {
  if (netRelativeToPar >= 2) return 0; // double bogey or worse
  if (netRelativeToPar === 1) return 1; // bogey
  if (netRelativeToPar === 0) return 2; // par
  if (netRelativeToPar === -1) return 3; // birdie
  if (netRelativeToPar === -2) return 4; // eagle
  return 5; // albatross or better
}

export type StablefordRow = {
  player_id: string;
  name: string;
  points: number;
  thru: number;
};

export function computeStablefordBoard(
  players: CasualPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course
): StablefordRow[] {
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));
  const rows = players.map((p) => {
    const ch = courseHandicap({ index: p.index }, course, "simple");
    const strokes = allocateStrokes(ch, course.holes);
    const scores = scoresByPlayer[p.id] ?? [];
    let points = 0;
    for (const s of scores) {
      const par = parByHole.get(s.hole_number) ?? 4;
      const net = s.gross - (strokes.get(s.hole_number) ?? 0);
      points += stablefordPoints(net - par);
    }
    return { player_id: p.id, name: p.name, points, thru: scores.length };
  });
  // Highest points first; players who haven't started sink to the bottom.
  return rows.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return a.name.localeCompare(b.name);
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Skins — net, full handicap. A hole only settles once EVERY player has posted
// it (otherwise an early finisher would scoop pots mid-round). Lowest unique
// net takes the skin plus any carried pots; ties carry.
// ---------------------------------------------------------------------------

export type SkinsResult = {
  rows: { player_id: string; name: string; skins: number; holesWon: number[] }[];
  holes: {
    hole_number: number;
    state: "pending" | "carried" | "won";
    winner_player_id: string | null;
    value: number; // skins riding on this hole (1 + carries) when settled
  }[];
  carrying: number; // pots currently riding into the next unsettled hole
};

export function computeSkins(
  players: CasualPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course
): SkinsResult {
  const strokesByPlayer = new Map(
    players.map((p) => {
      const ch = courseHandicap({ index: p.index }, course, "simple");
      return [p.id, allocateStrokes(ch, course.holes)] as const;
    })
  );
  const grossByPlayerHole = new Map<string, Map<number, number>>(
    players.map((p) => [
      p.id,
      new Map((scoresByPlayer[p.id] ?? []).map((s) => [s.hole_number, s.gross])),
    ])
  );

  const skinsWon = new Map<string, number[]>(players.map((p) => [p.id, []]));
  const holes: SkinsResult["holes"] = [];
  let carry = 0;

  const ordered = [...course.holes].sort((a, b) => a.hole_number - b.hole_number);
  for (const h of ordered) {
    const nets: { player_id: string; net: number }[] = [];
    let everyonePosted = players.length > 0;
    for (const p of players) {
      const gross = grossByPlayerHole.get(p.id)?.get(h.hole_number);
      if (gross == null) {
        everyonePosted = false;
        continue;
      }
      const received = strokesByPlayer.get(p.id)?.get(h.hole_number) ?? 0;
      nets.push({ player_id: p.id, net: gross - received });
    }

    if (!everyonePosted) {
      holes.push({ hole_number: h.hole_number, state: "pending", winner_player_id: null, value: 1 + carry });
      continue;
    }

    const best = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === best);
    if (winners.length === 1) {
      const value = 1 + carry;
      skinsWon.get(winners[0].player_id)!.push(h.hole_number);
      // Record total value via holes[]; rows count skins (incl. carries).
      holes.push({ hole_number: h.hole_number, state: "won", winner_player_id: winners[0].player_id, value });
      carry = 0;
    } else {
      holes.push({ hole_number: h.hole_number, state: "carried", winner_player_id: null, value: 1 + carry });
      carry += 1;
    }
  }

  const rows = players
    .map((p) => {
      const holesWonList = skinsWon.get(p.id) ?? [];
      const skins = holes
        .filter((h) => h.winner_player_id === p.id)
        .reduce((acc, h) => acc + h.value, 0);
      return { player_id: p.id, name: p.name, skins, holesWon: holesWonList };
    })
    .sort((a, b) => (b.skins !== a.skins ? b.skins - a.skins : a.name.localeCompare(b.name)));

  return { rows, holes, carrying: carry };
}

// ---------------------------------------------------------------------------
// Count your birdies — GROSS scores only. Birdie = 2 pts, eagle-or-better = 4.
// Holes listed in `doubledHoles` are worth double (the back nine of the trip's
// final round).
// ---------------------------------------------------------------------------

export function birdiePointsForHole(grossRelativeToPar: number): number {
  if (grossRelativeToPar <= -2) return 4; // eagle or better
  if (grossRelativeToPar === -1) return 2; // birdie
  return 0;
}

export type BirdieRow = {
  player_id: string;
  name: string;
  points: number;
  birdies: number;
  eagles: number;
  thru: number;
};

export function computeBirdieBoard(
  players: CasualPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course,
  doubledHoles: Set<number> = new Set()
): BirdieRow[] {
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));
  const rows = players.map((p) => {
    const scores = scoresByPlayer[p.id] ?? [];
    let points = 0;
    let birdies = 0;
    let eagles = 0;
    for (const s of scores) {
      const par = parByHole.get(s.hole_number) ?? 4;
      const rel = s.gross - par;
      const base = birdiePointsForHole(rel);
      if (base === 0) continue;
      if (rel === -1) birdies += 1;
      else eagles += 1;
      points += doubledHoles.has(s.hole_number) ? base * 2 : base;
    }
    return { player_id: p.id, name: p.name, points, birdies, eagles, thru: scores.length };
  });
  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.birdies !== a.birdies) return b.birdies - a.birdies;
    return a.name.localeCompare(b.name);
  });
}
