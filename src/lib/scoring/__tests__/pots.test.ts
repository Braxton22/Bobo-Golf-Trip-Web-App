import { describe, expect, it } from "vitest";
import {
  computeDeucesPot,
  computeLowNetPot,
  computeSkinResults,
  computeSkinsPot,
} from "../pots";
import { PAR, TEST_COURSE } from "./fixtures";
import type { HoleScore } from "../types";

const scoresFor = (g: number[]): HoleScore[] =>
  g.map((gross, i) => ({ hole_number: i + 1, gross }));

const A = { id: "a", name: "Alice", index: 0 };
const B = { id: "b", name: "Bob", index: 0 };
const C = { id: "c", name: "Cam", index: 0 };

describe("computeSkinResults", () => {
  it("single birdie wins the hole", () => {
    const grossA = PAR.slice();
    const grossB = PAR.slice();
    grossA[0] -= 1; // A birdies hole 1
    const res = computeSkinResults([A, B], { a: scoresFor(grossA), b: scoresFor(grossB) }, TEST_COURSE);
    expect(res[0]).toMatchObject({ state: "won", winner_player_id: "a", tier: 1 });
  });

  it("matching birdies cover the hole", () => {
    const grossA = PAR.slice();
    const grossB = PAR.slice();
    grossA[0] -= 1;
    grossB[0] -= 1;
    const res = computeSkinResults([A, B], { a: scoresFor(grossA), b: scoresFor(grossB) }, TEST_COURSE);
    expect(res[0]).toMatchObject({ state: "covered", winner_player_id: null, tier: 1 });
  });

  it("eagle beats a birdie even when both are under par on the same hole", () => {
    const grossA = PAR.slice();
    const grossB = PAR.slice();
    grossA[0] -= 1; // birdie
    grossB[0] -= 2; // eagle — wins
    const res = computeSkinResults([A, B], { a: scoresFor(grossA), b: scoresFor(grossB) }, TEST_COURSE);
    expect(res[0]).toMatchObject({ state: "won", winner_player_id: "b", tier: 2 });
  });

  it("two eagles cover; a birdie doesn't change that", () => {
    const grossA = PAR.slice();
    const grossB = PAR.slice();
    const grossC = PAR.slice();
    grossA[0] -= 2;
    grossB[0] -= 2;
    grossC[0] -= 1;
    const res = computeSkinResults(
      [A, B, C],
      { a: scoresFor(grossA), b: scoresFor(grossB), c: scoresFor(grossC) },
      TEST_COURSE
    );
    expect(res[0]).toMatchObject({ state: "covered", tier: 2 });
  });

  it("pending until every player has posted that hole", () => {
    const grossA = scoresFor([3]); // only A posted hole 1
    const res = computeSkinResults([A, B], { a: grossA, b: [] }, TEST_COURSE);
    expect(res[0].state).toBe("pending");
  });
});

describe("computeSkinsPot", () => {
  it("no winner & all 18 holes finalized → entire pot carries", () => {
    const flatPar = scoresFor(PAR); // par on every hole, no birdies
    const res = computeSkinsPot([A, B], { a: flatPar, b: flatPar }, TEST_COURSE, 10, 0);
    expect(res.potTotal).toBe(20);
    expect(res.winners).toEqual([]);
    expect(res.carryOut).toBe(20);
    expect(res.settled).toBe(true);
  });

  it("carry_in is added to pot total and shared by the single skin", () => {
    const a = PAR.slice();
    a[0] -= 1;
    const b = PAR.slice();
    const res = computeSkinsPot([A, B], { a: scoresFor(a), b: scoresFor(b) }, TEST_COURSE, 10, 30);
    // pot = 2 * 10 + 30 carry = 50; one skin → all $50 to A.
    expect(res.potTotal).toBe(50);
    expect(res.winners).toEqual([{ player_id: "a", amount: 50 }]);
    expect(res.carryOut).toBe(0);
  });

  it("splits pot evenly per skin won; cents add up", () => {
    // Three holes, three skin winners → $40 / 3 = $13.34, $13.33, $13.33
    const a = PAR.slice();
    const b = PAR.slice();
    a[0] -= 1; // A skin hole 1
    b[1] -= 1; // B skin hole 2
    a[2] -= 1; // A skin hole 3
    const res = computeSkinsPot([A, B], { a: scoresFor(a), b: scoresFor(b) }, TEST_COURSE, 20, 0);
    const total = res.winners.reduce((acc, w) => acc + w.amount, 0);
    expect(total).toBeCloseTo(40, 5);
    const aWin = res.winners.find((w) => w.player_id === "a")!;
    expect(aWin.amount).toBeCloseTo(26.67, 5);
  });
});

describe("computeDeucesPot", () => {
  it("a gross 2 anywhere counts; multiple deuces per player allowed", () => {
    // A makes 2 on holes 3 and 8 (both par 3s); B makes a 2 on hole 12.
    const aScores: HoleScore[] = [
      { hole_number: 3, gross: 2 },
      { hole_number: 8, gross: 2 },
    ];
    const bScores: HoleScore[] = [{ hole_number: 12, gross: 2 }];
    const res = computeDeucesPot([A, B], { a: aScores, b: bScores }, 10, 0, TEST_COURSE);
    expect(res.potTotal).toBe(20);
    // 3 deuces → $20/3 each; A wins 2 shares.
    const a = res.winners.find((w) => w.player_id === "a")!;
    const b = res.winners.find((w) => w.player_id === "b")!;
    expect(a.amount).toBeCloseTo(20 - b.amount, 5);
    expect(a.amount).toBeGreaterThan(b.amount);
  });

  it("no deuces & round finished → pot carries", () => {
    // Fill all 18 holes at par for both.
    const flat = scoresFor(PAR);
    const res = computeDeucesPot([A, B], { a: flat, b: flat }, 10, 0, TEST_COURSE);
    expect(res.winners).toEqual([]);
    expect(res.carryOut).toBe(20);
    expect(res.settled).toBe(true);
  });
});

describe("computeLowNetPot", () => {
  it("only settles when every entrant has finished all 18 holes", () => {
    const partial: HoleScore[] = [{ hole_number: 1, gross: 4 }];
    const res = computeLowNetPot([A, B], { a: partial, b: partial }, TEST_COURSE, 10, 0);
    expect(res.settled).toBe(false);
    expect(res.winners).toEqual([]);
  });

  it("lowest net wins; ties split", () => {
    const a = scoresFor(PAR); // even par net (idx 0)
    const b = scoresFor(PAR.map((p) => p + 1)); // bogey every hole, idx 0 → +18 net
    const res = computeLowNetPot([A, B], { a, b }, TEST_COURSE, 10, 0);
    expect(res.winners).toEqual([{ player_id: "a", amount: 20 }]);
    expect(res.carryOut).toBe(0);
  });
});
