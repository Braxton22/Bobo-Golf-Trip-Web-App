import { describe, expect, it } from "vitest";
import { matchResult, runMatchPlay } from "../match";
import { computeCupStandings } from "../leaderboard";

const map = (arr: number[]) => new Map(arr.map((v, i) => [i + 1, v]));

describe("runMatchPlay", () => {
  it("tracks UP/DOWN and thru", () => {
    // A wins 1, halves 2, A wins 3 → 2 UP thru 3
    const p = runMatchPlay(map([4, 5, 4]), map([5, 5, 5]));
    expect(p.upDown).toBe(2);
    expect(p.thru).toBe(3);
    expect(p.decided).toBeNull();
  });

  it("decides 3 & 2 when up 3 with 2 to go", () => {
    // 16 holes played; A is +3, 2 to go → decided
    const a = Array.from({ length: 16 }, (_, i) => (i < 3 ? 3 : 4));
    const b = Array.from({ length: 16 }, () => 4);
    const p = runMatchPlay(map(a), map(b));
    expect(p.decided?.winner).toBe("A");
    expect(p.decided?.margin?.up).toBe(3);
    expect(p.decided?.margin?.toGo).toBe(2);
  });

  it("AS through 18 = halved match", () => {
    const a = Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 3 : 5));
    const b = Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 5 : 3));
    const p = runMatchPlay(map(a), map(b));
    expect(p.decided?.winner).toBe("halve");
  });

  it("ignores holes where one side is missing a score", () => {
    const aMap = new Map([
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
    const bMap = new Map([
      [1, 5],
      [3, 4],
    ]);
    const p = runMatchPlay(aMap, bMap);
    // Hole 2 skipped (no B score). Hole 1: A wins. Hole 3: halve. → A 1 UP thru 2
    expect(p.thru).toBe(2);
    expect(p.upDown).toBe(1);
  });
});

describe("matchResult scoreline", () => {
  it('formats "3 & 2"', () => {
    const a = Array.from({ length: 16 }, (_, i) => (i < 3 ? 3 : 4));
    const b = Array.from({ length: 16 }, () => 4);
    const r = matchResult(runMatchPlay(map(a), map(b)));
    expect(r.scoreline).toBe("3 & 2");
    expect(r.points).toEqual({ a: 1, b: 0 });
  });

  it('formats "AS" on a tied 18-hole match', () => {
    const a = Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 3 : 5));
    const b = Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 5 : 3));
    const r = matchResult(runMatchPlay(map(a), map(b)));
    expect(r.scoreline).toBe("AS");
    expect(r.points).toEqual({ a: 0.5, b: 0.5 });
  });

  it("provisional scoreline in progress", () => {
    const r = matchResult(runMatchPlay(map([4, 4, 4]), map([5, 4, 5])));
    expect(r.status).toBe("in_progress");
    expect(r.scoreline).toMatch(/A 2 UP thru 3/);
  });
});

describe("computeCupStandings", () => {
  it("running totals before decided", () => {
    const s = computeCupStandings([
      { team_a_points: 1, team_b_points: 0 },
      { team_a_points: 0.5, team_b_points: 0.5 },
      { team_a_points: 0, team_b_points: 1 },
    ]);
    expect(s.teamAPoints).toBe(1.5);
    expect(s.teamBPoints).toBe(1.5);
    expect(s.status).toBe("in_progress");
    expect(s.scoreline).toBe("1½ – 1½");
  });

  it("declares winner at 6.5 of 12", () => {
    const matches = [
      ...Array.from({ length: 6 }, () => ({ team_a_points: 1, team_b_points: 0 })),
      { team_a_points: 0.5, team_b_points: 0.5 },
    ];
    const s = computeCupStandings(matches);
    expect(s.teamAPoints).toBe(6.5);
    expect(s.status).toBe("decided");
    expect(s.winner).toBe("A");
  });

  it("ties at 6-6 with all 12 decided", () => {
    const matches = [
      ...Array.from({ length: 6 }, () => ({ team_a_points: 1, team_b_points: 0 })),
      ...Array.from({ length: 6 }, () => ({ team_a_points: 0, team_b_points: 1 })),
    ];
    const s = computeCupStandings(matches, { tieOutcomeLabel: "Cup retained" });
    expect(s.status).toBe("tie");
    expect(s.scoreline).toContain("Cup retained");
  });
});
