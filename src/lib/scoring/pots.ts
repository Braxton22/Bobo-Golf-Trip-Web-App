// Pot scoring: skins / deuces / low net.  All pure.
//
// Skins rules per spec:
//   - A skin requires a birdie-or-better on a hole.
//   - Score "tier" = par − gross (1 = birdie, 2 = eagle, 3 = albatross, …).
//   - On each hole, find the MAX tier ≥ 1 across the field. If exactly one
//     player has that tier, they win the skin. Multiple at the top tier =
//     "covered", no skin awarded that hole.
//   - Eagles beat birdies even if other players birdied (eagle is a higher
//     tier; covering only happens at the same tier).
//
// Deuces: any GROSS 2 anywhere. Each occurrence is a deuce; one player can
// rack up multiple deuces in a round.
//
// Low net: per-round NET total (full handicap by stroke index). Lowest wins.
// Ties split equally.
//
// Pot payouts:
//   pot_total = entrants × buy_in + carry_in
//   skins / deuces: payout per occurrence = pot_total / total_occurrences.
//   low_net: pot_total goes to the lowest-net entrant(s), split on tie.
//   If no winner, the whole pot carries to the next round of the same trip.

import { allocateStrokes, courseHandicap } from "./handicap";
import type { Course, HoleScore } from "./types";

export type PotPlayer = { id: string; name: string; index: number };

// ---------------------------------------------------------------------------
// Skins
// ---------------------------------------------------------------------------

export type SkinResult = {
  hole_number: number;
  state: "no_under" | "covered" | "won" | "pending";
  winner_player_id: string | null;
  /** 1 = birdie, 2 = eagle, 3 = albatross, … */
  tier: number;
};

/** Per-hole skin outcome across the whole field. Holes where not every player
 *  has posted are "pending" so live UI can show what's still settling. */
export function computeSkinResults(
  players: PotPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course
): SkinResult[] {
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));
  const grossByPlayer = new Map<string, Map<number, number>>(
    players.map((p) => [
      p.id,
      new Map((scoresByPlayer[p.id] ?? []).map((s) => [s.hole_number, s.gross])),
    ])
  );

  const out: SkinResult[] = [];
  for (const h of [...course.holes].sort((a, b) => a.hole_number - b.hole_number)) {
    const par = parByHole.get(h.hole_number) ?? 4;
    let everyonePosted = players.length > 0;
    const tiers: { player_id: string; tier: number }[] = [];
    for (const p of players) {
      const gross = grossByPlayer.get(p.id)?.get(h.hole_number);
      if (gross == null) {
        everyonePosted = false;
        continue;
      }
      const tier = par - gross;
      if (tier >= 1) tiers.push({ player_id: p.id, tier });
    }
    if (!everyonePosted) {
      out.push({ hole_number: h.hole_number, state: "pending", winner_player_id: null, tier: 0 });
      continue;
    }
    if (tiers.length === 0) {
      out.push({ hole_number: h.hole_number, state: "no_under", winner_player_id: null, tier: 0 });
      continue;
    }
    const topTier = Math.max(...tiers.map((t) => t.tier));
    const atTop = tiers.filter((t) => t.tier === topTier);
    if (atTop.length === 1) {
      out.push({
        hole_number: h.hole_number,
        state: "won",
        winner_player_id: atTop[0].player_id,
        tier: topTier,
      });
    } else {
      out.push({ hole_number: h.hole_number, state: "covered", winner_player_id: null, tier: topTier });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deuces
// ---------------------------------------------------------------------------

export type DeuceResult = { hole_number: number; player_id: string };

export function computeDeuces(
  players: PotPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>
): DeuceResult[] {
  const out: DeuceResult[] = [];
  for (const p of players) {
    for (const s of scoresByPlayer[p.id] ?? []) {
      if (s.gross === 2) out.push({ hole_number: s.hole_number, player_id: p.id });
    }
  }
  return out.sort((a, b) => a.hole_number - b.hole_number);
}

// ---------------------------------------------------------------------------
// Low net round
// ---------------------------------------------------------------------------

export type LowNetRow = {
  player_id: string;
  name: string;
  thru: number;
  net: number | null;
};

export function computeLowNetRows(
  players: PotPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course
): LowNetRow[] {
  return players
    .map((p) => {
      const ch = courseHandicap({ index: p.index }, course, "simple");
      const strokes = allocateStrokes(ch, course.holes);
      const scores = scoresByPlayer[p.id] ?? [];
      if (scores.length === 0) {
        return { player_id: p.id, name: p.name, thru: 0, net: null };
      }
      let net = 0;
      for (const s of scores) net += s.gross - (strokes.get(s.hole_number) ?? 0);
      return { player_id: p.id, name: p.name, thru: scores.length, net };
    })
    .sort((a, b) => {
      if (a.net == null && b.net == null) return a.name.localeCompare(b.name);
      if (a.net == null) return 1;
      if (b.net == null) return -1;
      if (a.net !== b.net) return a.net - b.net;
      return a.name.localeCompare(b.name);
    });
}

// ---------------------------------------------------------------------------
// Pot payouts
// ---------------------------------------------------------------------------

export type Payout = { player_id: string; amount: number };
export type PotPayout = {
  potTotal: number;
  entrants: number;
  buyIn: number;
  carryIn: number;
  carryOut: number; // > 0 if no winners
  winners: Payout[];
  detail: {
    skins?: SkinResult[];
    deuces?: DeuceResult[];
    lowNet?: LowNetRow[];
  };
  // True only when the round has at least one settled element (skin won/covered/no_under,
  // or any deuce, or every entrant has posted ≥1 hole). Used to decide whether
  // to carry forward when there's nothing settled yet.
  settled: boolean;
};

/** Round cents-safe: pot/N split into per-share with the remainder added back
 *  to the first share so the totals are exact to the penny. */
function splitEvenly(potCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(potCents / n);
  const rem = potCents - base * n;
  const out = new Array(n).fill(base);
  for (let i = 0; i < rem; i++) out[i] += 1;
  return out;
}

export function computeSkinsPot(
  entrants: PotPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course,
  buyIn: number,
  carryIn: number
): PotPayout {
  const results = computeSkinResults(entrants, scoresByPlayer, course);
  const wins = results.filter((r) => r.state === "won");
  const potTotal = entrants.length * buyIn + carryIn;

  const someoneFinished = results.some((r) => r.state !== "pending");
  const allHolesFinal = results.every((r) => r.state !== "pending");

  if (!someoneFinished) {
    return {
      potTotal,
      entrants: entrants.length,
      buyIn,
      carryIn,
      carryOut: 0,
      winners: [],
      detail: { skins: results },
      settled: false,
    };
  }

  if (wins.length === 0) {
    // No winner so far. If holes are still pending, leave it open; otherwise
    // carry the full pot forward.
    return {
      potTotal,
      entrants: entrants.length,
      buyIn,
      carryIn,
      carryOut: allHolesFinal ? potTotal : 0,
      winners: [],
      detail: { skins: results },
      settled: allHolesFinal,
    };
  }

  // Pay out across all skins won so far. Round-cents safe.
  const cents = Math.round(potTotal * 100);
  const shares = splitEvenly(cents, wins.length);
  const byPlayer = new Map<string, number>();
  wins.forEach((w, i) => {
    if (!w.winner_player_id) return;
    byPlayer.set(w.winner_player_id, (byPlayer.get(w.winner_player_id) ?? 0) + shares[i]);
  });
  const winners: Payout[] = [...byPlayer.entries()].map(([player_id, c]) => ({
    player_id,
    amount: c / 100,
  }));

  return {
    potTotal,
    entrants: entrants.length,
    buyIn,
    carryIn,
    carryOut: 0,
    winners,
    detail: { skins: results },
    settled: allHolesFinal,
  };
}

export function computeDeucesPot(
  entrants: PotPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  buyIn: number,
  carryIn: number,
  course: Course
): PotPayout {
  const deuces = computeDeuces(entrants, scoresByPlayer);
  const potTotal = entrants.length * buyIn + carryIn;
  const allHolesFinal = entrants.every((p) => (scoresByPlayer[p.id]?.length ?? 0) >= course.holes.length);

  if (entrants.every((p) => (scoresByPlayer[p.id]?.length ?? 0) === 0)) {
    return {
      potTotal,
      entrants: entrants.length,
      buyIn,
      carryIn,
      carryOut: 0,
      winners: [],
      detail: { deuces },
      settled: false,
    };
  }

  if (deuces.length === 0) {
    return {
      potTotal,
      entrants: entrants.length,
      buyIn,
      carryIn,
      carryOut: allHolesFinal ? potTotal : 0,
      winners: [],
      detail: { deuces },
      settled: allHolesFinal,
    };
  }

  const cents = Math.round(potTotal * 100);
  const shares = splitEvenly(cents, deuces.length);
  const byPlayer = new Map<string, number>();
  deuces.forEach((d, i) => {
    byPlayer.set(d.player_id, (byPlayer.get(d.player_id) ?? 0) + shares[i]);
  });

  return {
    potTotal,
    entrants: entrants.length,
    buyIn,
    carryIn,
    carryOut: 0,
    winners: [...byPlayer.entries()].map(([player_id, c]) => ({ player_id, amount: c / 100 })),
    detail: { deuces },
    settled: allHolesFinal,
  };
}

export function computeLowNetPot(
  entrants: PotPlayer[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course,
  buyIn: number,
  carryIn: number
): PotPayout {
  const rows = computeLowNetRows(entrants, scoresByPlayer, course);
  const potTotal = entrants.length * buyIn + carryIn;
  const finished = rows.filter((r) => r.thru === course.holes.length);
  const finishedSet = new Set(finished.map((r) => r.player_id));

  // Only crown winners once EVERY entrant has finished the round.
  const allDone = entrants.length > 0 && entrants.every((p) => finishedSet.has(p.id));

  if (!allDone) {
    return {
      potTotal,
      entrants: entrants.length,
      buyIn,
      carryIn,
      carryOut: 0,
      winners: [],
      detail: { lowNet: rows },
      settled: false,
    };
  }

  if (finished.length === 0) {
    return {
      potTotal,
      entrants: entrants.length,
      buyIn,
      carryIn,
      carryOut: potTotal,
      winners: [],
      detail: { lowNet: rows },
      settled: true,
    };
  }

  const best = Math.min(...finished.map((r) => r.net as number));
  const winnersList = finished.filter((r) => r.net === best);
  const cents = Math.round(potTotal * 100);
  const shares = splitEvenly(cents, winnersList.length);

  return {
    potTotal,
    entrants: entrants.length,
    buyIn,
    carryIn,
    carryOut: 0,
    winners: winnersList.map((r, i) => ({ player_id: r.player_id, amount: shares[i] / 100 })),
    detail: { lowNet: rows },
    settled: true,
  };
}
