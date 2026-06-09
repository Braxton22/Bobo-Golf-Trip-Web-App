// Core data shapes used by the scoring engine. Keep these tight and serialisable
// so they can be passed across the server/client boundary without ceremony.

export type Hole = {
  hole_number: number; // 1..18
  par: number;
  stroke_index: number; // 1..18, lower = harder
};

export type Course = {
  holes: Hole[]; // length 18, hole_number 1..18, stroke_index 1..18
  par?: number; // optional course rating fields, used by slope mode only
  rating?: number;
  slope?: number;
};

export type HandicapMode = "simple" | "slope";

export type PlayerHandicap = {
  index: number; // handicap index, e.g. 12.4
  // Slope-mode-only inputs; ignored in simple mode.
  slope?: number;
  rating?: number;
  par?: number;
};

export type ScrambleAllowance = {
  low: number; // fraction of LOWER partner's index, e.g. 0.35
  high: number; // fraction of HIGHER partner's index, e.g. 0.15
};

export type HoleScore = {
  hole_number: number;
  gross: number; // strokes
};

// Two-man pair, used by Day 1 (scramble) and Day 2 (best ball + bonus).
export type Pair = {
  a: { player_id: string; index: number };
  b: { player_id: string; index: number };
};

// Result of a head-to-head match-play hole comparison.
export type HoleResult = "A" | "B" | "halve";

export type MatchProgress = {
  // From perspective of side A.
  upDown: number; // +N = A up by N, -N = A down by N, 0 = all square
  thru: number; // holes completed
  holesRemaining: number; // 18 - thru
  // If decided, the match closed at "thru" with this margin (e.g. "3 & 2").
  decided: null | { winner: "A" | "B" | "halve"; margin?: { up: number; toGo: number } };
  // Per-hole detail, in order.
  holes: { hole_number: number; aTeamScore: number; bTeamScore: number; result: HoleResult; upDownAfter: number }[];
};

export type MatchSideResult = {
  // Match-play points awarded to side A and side B.
  points: { a: number; b: number };
  status: "in_progress" | "complete";
  // Provisional or final scoreline ("2 UP thru 14", "3 & 2", "AS").
  scoreline: string;
};
