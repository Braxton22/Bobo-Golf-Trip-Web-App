import { describe, expect, it } from "vitest";
import { bestBallBonusPerHole, scrambleMatchPerHole, singlesPerHoleNet } from "../formats";
import { TEST_COURSE, TEST_HOLES } from "./fixtures";
import type { HoleScore } from "../types";

const allGross = (g: number): HoleScore[] =>
  Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, gross: g }));

describe("singlesPerHoleNet", () => {
  it("subtracts strokes per stroke index", () => {
    const net = singlesPerHoleNet(5, allGross(5), TEST_COURSE);
    // SI 1..5 each get 1 stroke → net 4; rest stay at 5.
    const stroked = TEST_HOLES.filter((h) => h.stroke_index <= 5).map((h) => h.hole_number);
    for (const hn of stroked) expect(net.get(hn)).toBe(4);
    const unstroked = TEST_HOLES.filter((h) => h.stroke_index > 5).map((h) => h.hole_number);
    for (const hn of unstroked) expect(net.get(hn)).toBe(5);
  });
  it("plays scratch when index rounds to 0", () => {
    const net = singlesPerHoleNet(0.3, allGross(4), TEST_COURSE);
    for (const h of TEST_HOLES) expect(net.get(h.hole_number)).toBe(4);
  });
});

describe("scrambleMatchPerHole", () => {
  it("lower team plays scratch, higher gets the diff by SI", () => {
    // Team A: 6 + 18 → CH = round(0.35*6 + 0.15*18) = 5
    // Team B: 0 + 4  → CH = round(0.35*0 + 0.15*4) = round(0.6) = 1
    // diff = 4 → side A receives strokes on SI 1..4
    const { aPerHole, bPerHole, aTeamHandicap, bTeamHandicap } = scrambleMatchPerHole(
      { pair: { a: { player_id: "a1", index: 6 }, b: { player_id: "a2", index: 18 } }, scores: allGross(5) },
      { pair: { a: { player_id: "b1", index: 0 }, b: { player_id: "b2", index: 4 } }, scores: allGross(5) },
      TEST_COURSE
    );
    expect(aTeamHandicap).toBe(5);
    expect(bTeamHandicap).toBe(1);
    // A is the higher-handicap team → A receives strokes on SI 1..4
    const strokedA = TEST_HOLES.filter((h) => h.stroke_index <= 4);
    for (const h of strokedA) {
      expect(aPerHole.get(h.hole_number)).toBe(4); // 5 - 1
    }
    // B never receives strokes
    for (const h of TEST_HOLES) expect(bPerHole.get(h.hole_number)).toBe(5);
  });
});

describe("bestBallBonusPerHole — worked examples from §6", () => {
  // Use ONLY hole 1 (par 4, SI 5 in our fixture) and give both partners 5 strokes
  // so they each get a stroke on hole 1 (SI 5 ≤ 5).

  const pair = {
    a: { player_id: "A", index: 5 },
    b: { player_id: "B", index: 5 },
  } as const;

  it("both gross 5 (par 4, both get a stroke) → net 4 & 4 → both net par → bonus → team 3", () => {
    const team = bestBallBonusPerHole(
      {
        pair,
        scoresByPlayer: {
          A: [{ hole_number: 1, gross: 5 }],
          B: [{ hole_number: 1, gross: 5 }],
        },
      },
      TEST_COURSE
    );
    expect(team.get(1)).toBe(3);
  });

  it("gross 4 & 5 → net 3 & 4 → best=3, both ≤ par → bonus → team 2", () => {
    const team = bestBallBonusPerHole(
      {
        pair,
        scoresByPlayer: {
          A: [{ hole_number: 1, gross: 4 }],
          B: [{ hole_number: 1, gross: 5 }],
        },
      },
      TEST_COURSE
    );
    expect(team.get(1)).toBe(2);
  });

  it("net 4 & 5 (e.g. gross 4 & 6 with strokes) → best=4, one bogey → no bonus → team 4", () => {
    // Player A: gross 4, stroked → net 3. Player B: gross 6, stroked → net 5. Best=3, no bonus → 3.
    // Need to construct the "net 4 & 5" case: A gross 5 stroked = net 4 (par), B gross 6 stroked = net 5 (bogey)
    const team = bestBallBonusPerHole(
      {
        pair,
        scoresByPlayer: {
          A: [{ hole_number: 1, gross: 5 }],
          B: [{ hole_number: 1, gross: 6 }],
        },
      },
      TEST_COURSE
    );
    expect(team.get(1)).toBe(4);
  });

  it("only one partner posted: no bonus, best-ball uses the lone net", () => {
    const team = bestBallBonusPerHole(
      {
        pair,
        scoresByPlayer: {
          A: [{ hole_number: 1, gross: 4 }],
          B: [],
        },
      },
      TEST_COURSE
    );
    // A net = 3 (par-or-better), but B didn't play → no bonus.
    expect(team.get(1)).toBe(3);
  });

  it("net birdie + net par: both ≤ par → bonus", () => {
    // A: gross 3, no stroke (SI 5 > 0 strokes) → net 3 (birdie)
    // B: gross 4, no stroke → net 4 (par)
    const team = bestBallBonusPerHole(
      {
        pair: { a: { player_id: "A", index: 0 }, b: { player_id: "B", index: 0 } },
        scoresByPlayer: {
          A: [{ hole_number: 1, gross: 3 }],
          B: [{ hole_number: 1, gross: 4 }],
        },
      },
      TEST_COURSE
    );
    expect(team.get(1)).toBe(2); // best=3, bonus -1
  });
});
