import { describe, expect, it } from "vitest";
import { allocateStrokes, courseHandicap, scrambleTeamHandicap, netHole } from "../handicap";
import { TEST_COURSE, TEST_HOLES } from "./fixtures";

describe("courseHandicap (simple mode)", () => {
  it("rounds the index", () => {
    expect(courseHandicap({ index: 12.4 }, TEST_COURSE)).toBe(12);
    expect(courseHandicap({ index: 12.5 }, TEST_COURSE)).toBe(13);
    expect(courseHandicap({ index: 0 }, TEST_COURSE)).toBe(0);
  });
  it("clamps negatives to 0", () => {
    expect(courseHandicap({ index: -1.6 }, TEST_COURSE)).toBe(0);
  });
});

describe("courseHandicap (slope mode)", () => {
  it("uses slope formula: round(Index * Slope/113 + (Rating - Par))", () => {
    // 12 * 130/113 + (71.5 - 72) = 13.805... - 0.5 = 13.305... → 13
    expect(courseHandicap({ index: 12 }, TEST_COURSE, "slope")).toBe(13);
  });
});

describe("allocateStrokes", () => {
  it("gives 0 strokes everywhere when N=0", () => {
    const m = allocateStrokes(0, TEST_HOLES);
    expect([...m.values()].every((v) => v === 0)).toBe(true);
  });
  it("gives 1 stroke to every hole with SI<=N for N<=18", () => {
    const m = allocateStrokes(5, TEST_HOLES);
    let ones = 0;
    for (const h of TEST_HOLES) {
      const s = m.get(h.hole_number) ?? 0;
      if (h.stroke_index <= 5) expect(s).toBe(1);
      else expect(s).toBe(0);
      ones += s;
    }
    expect(ones).toBe(5);
  });
  it("gives a 2nd stroke on the hardest holes when N>18", () => {
    const m = allocateStrokes(20, TEST_HOLES); // every hole gets 1, hardest 2 get a 2nd
    const counts = TEST_HOLES.map((h) => ({ si: h.stroke_index, n: m.get(h.hole_number) ?? 0 }));
    // Total strokes = 20
    expect(counts.reduce((a, c) => a + c.n, 0)).toBe(20);
    // Holes with SI 1 and 2 should have 2 strokes; rest 1.
    expect(counts.find((c) => c.si === 1)?.n).toBe(2);
    expect(counts.find((c) => c.si === 2)?.n).toBe(2);
    expect(counts.find((c) => c.si === 3)?.n).toBe(1);
  });
});

describe("netHole", () => {
  it("subtracts strokes received from gross", () => {
    expect(netHole(5, 1)).toBe(4);
    expect(netHole(3, 0)).toBe(3);
  });
});

describe("scrambleTeamHandicap", () => {
  it("uses 35% low + 15% high by default", () => {
    // low=6, high=18 → 0.35*6 + 0.15*18 = 2.1 + 2.7 = 4.8 → 5
    expect(scrambleTeamHandicap(6, 18)).toBe(5);
  });
  it("respects custom allowances", () => {
    // 50% low + 20% high: 0.5*8 + 0.2*16 = 4 + 3.2 = 7.2 → 7
    expect(scrambleTeamHandicap(8, 16, { low: 0.5, high: 0.2 })).toBe(7);
  });
  it("is symmetric regardless of which partner is 'a'", () => {
    expect(scrambleTeamHandicap(10, 4)).toBe(scrambleTeamHandicap(4, 10));
  });
});
