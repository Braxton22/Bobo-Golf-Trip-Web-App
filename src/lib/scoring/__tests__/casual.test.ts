import { describe, expect, it } from "vitest";
import {
  birdiePointsForHole,
  computeBirdieBoard,
  computeSkins,
  computeStablefordBoard,
  stablefordPoints,
} from "../casual";
import { PAR, TEST_COURSE } from "./fixtures";
import type { HoleScore } from "../types";

const scoresFor = (grossPerHole: number[]): HoleScore[] =>
  grossPerHole.map((gross, i) => ({ hole_number: i + 1, gross }));

describe("stablefordPoints", () => {
  it("maps net-to-par to the classic point ladder", () => {
    expect(stablefordPoints(2)).toBe(0); // double
    expect(stablefordPoints(3)).toBe(0); // worse than double
    expect(stablefordPoints(1)).toBe(1); // bogey
    expect(stablefordPoints(0)).toBe(2); // par
    expect(stablefordPoints(-1)).toBe(3); // birdie
    expect(stablefordPoints(-2)).toBe(4); // eagle
    expect(stablefordPoints(-3)).toBe(5); // albatross
  });
});

describe("computeStablefordBoard", () => {
  it("a scratch player shooting even par scores 36", () => {
    const rows = computeStablefordBoard(
      [{ id: "p1", name: "Scratch", index: 0 }],
      { p1: scoresFor(PAR) },
      TEST_COURSE
    );
    expect(rows[0].points).toBe(36);
    expect(rows[0].thru).toBe(18);
  });

  it("handicap strokes convert bogeys into net pars", () => {
    // 18-handicap shooting all bogeys: every hole nets to par → 36 points.
    const rows = computeStablefordBoard(
      [{ id: "p1", name: "Bogey golfer", index: 18 }],
      { p1: scoresFor(PAR.map((p) => p + 1)) },
      TEST_COURSE
    );
    expect(rows[0].points).toBe(36);
  });

  it("sorts highest points first, never-started players last", () => {
    const rows = computeStablefordBoard(
      [
        { id: "a", name: "A", index: 0 },
        { id: "b", name: "B", index: 0 },
        { id: "c", name: "C", index: 0 },
      ],
      { a: scoresFor(PAR), b: scoresFor(PAR.map((p) => p - 1)) },
      TEST_COURSE
    );
    expect(rows.map((r) => r.player_id)).toEqual(["b", "a", "c"]);
  });
});

describe("computeSkins", () => {
  const players = [
    { id: "a", name: "A", index: 0 },
    { id: "b", name: "B", index: 0 },
  ];

  it("lowest unique net wins the skin; ties carry the pot", () => {
    // Hole 1: tie (carry). Hole 2: A wins → worth 2 skins. Hole 3: B wins → 1.
    const a = [4, 3, 5];
    const b = [4, 4, 4];
    const res = computeSkins(
      players,
      { a: scoresFor(a), b: scoresFor(b) },
      TEST_COURSE
    );
    const rowA = res.rows.find((r) => r.player_id === "a")!;
    const rowB = res.rows.find((r) => r.player_id === "b")!;
    expect(rowA.skins).toBe(2);
    expect(rowB.skins).toBe(1);
    expect(res.holes[0].state).toBe("carried");
    expect(res.holes[1]).toMatchObject({ state: "won", winner_player_id: "a", value: 2 });
  });

  it("holes don't settle until everyone has posted", () => {
    const res = computeSkins(
      players,
      { a: scoresFor([3]), b: [] },
      TEST_COURSE
    );
    expect(res.holes[0].state).toBe("pending");
    expect(res.rows.every((r) => r.skins === 0)).toBe(true);
  });

  it("net skins: strokes flip a gross tie", () => {
    // Hole 5 is SI 1. An 18-index gets a stroke everywhere; gross tie on
    // hole 5 becomes a net win for the higher handicapper.
    const high = { id: "h", name: "High", index: 18 };
    const low = { id: "l", name: "Low", index: 0 };
    const gross = PAR.slice();
    const res = computeSkins(
      [high, low],
      { h: scoresFor(gross), l: scoresFor(gross) },
      TEST_COURSE
    );
    const rowH = res.rows.find((r) => r.player_id === "h")!;
    expect(rowH.skins).toBe(18); // every hole nets lower for the stroke receiver
  });
});

describe("count your birdies", () => {
  it("scores 2 for birdie, 4 for eagle-or-better, 0 otherwise", () => {
    expect(birdiePointsForHole(-1)).toBe(2);
    expect(birdiePointsForHole(-2)).toBe(4);
    expect(birdiePointsForHole(-3)).toBe(4);
    expect(birdiePointsForHole(0)).toBe(0);
    expect(birdiePointsForHole(1)).toBe(0);
  });

  it("uses GROSS scores and doubles the marked holes", () => {
    // Birdies on holes 1 (normal) and 10 (doubled), eagle on 5 (normal).
    const gross = PAR.slice();
    gross[0] -= 1; // hole 1 birdie → 2
    gross[9] -= 1; // hole 10 birdie, doubled → 4
    gross[4] -= 2; // hole 5 eagle → 4
    const rows = computeBirdieBoard(
      [{ id: "p", name: "P", index: 36 }], // big index must NOT matter (gross)
      { p: scoresFor(gross) },
      TEST_COURSE,
      new Set([10, 11, 12, 13, 14, 15, 16, 17, 18])
    );
    expect(rows[0].points).toBe(10);
    expect(rows[0].birdies).toBe(2);
    expect(rows[0].eagles).toBe(1);
  });
});
