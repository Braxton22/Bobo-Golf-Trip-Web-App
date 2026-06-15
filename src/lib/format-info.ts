// Single source of truth for how each day's format is described in the UI.
// Used by /format and the inline explainer on the scorecard so the wording
// stays in sync.

export type FormatKey = "scramble" | "best_ball_bonus" | "singles";

export type FormatInfo = {
  key: FormatKey;
  day: number;
  title: string;          // e.g. "Day 1 — Scramble"
  short: string;          // e.g. "Scramble"
  size: string;           // "2-man team", "1v1"
  entryRule: string;      // who has to enter scores
  scoringRule: string;    // how the team/personal score is derived per hole
  matchRule: string;      // how holes / matches are awarded
};

export const FORMATS: FormatInfo[] = [
  {
    key: "scramble",
    day: 1,
    title: "Day 1 — Scramble",
    short: "Scramble",
    size: "2-man team",
    entryRule:
      "ONE gross per hole, entered for the team. Either teammate can post — your partner doesn't need to re-enter.",
    scoringRule:
      "Team handicap = round(0.35 × lower partner's index + 0.15 × higher partner's index). EACH team plays off its own handicap — full strokes allocated by stroke index. Team net per hole = team gross − strokes received on that hole.",
    matchRule:
      "Lower team net score wins the hole. Match play — track UP/DOWN through 18. Each match worth 1 point.",
  },
  {
    key: "best_ball_bonus",
    day: 2,
    title: "Day 2 — Best Ball + Bonus",
    short: "Best Ball + Bonus",
    size: "2-man team",
    entryRule:
      "EACH partner plays their own ball, so each partner enters their own gross per hole.",
    scoringRule:
      "Each partner's net = gross − strokes received on that hole. Team hole = the better of the two nets. BONUS: if BOTH partners made net par-or-better on that hole, the team score gets an extra −1 stroke.",
    matchRule:
      "Lower team score wins the hole. Match play through 18. Each match worth 1 point.",
  },
  {
    key: "singles",
    day: 3,
    title: "Day 3 — Singles",
    short: "Singles",
    size: "1v1",
    entryRule:
      "Each player enters their own gross per hole. There are 6 of these matches — everyone plays.",
    scoringRule:
      "Full handicap by stroke index — each player receives their full simple-mode strokes on the holes that match their handicap, hardest holes first.",
    matchRule:
      "Lower net score wins the hole. Match play through 18. Each match worth 1 point.",
  },
];

export const CUP_RULES = {
  totalMatches: 12,
  totalPoints: 12,
  pointsToWin: 6.5,
  breakdown: "3 scramble + 3 best-ball + 6 singles",
  tieDefault: "Cup retained / shared (admin-configurable per trip).",
};

export const HANDICAP_BLURB =
  "Course handicap is simple-mode by default: round(Index). Strokes are allocated by stroke index — 1 stroke on every hole with SI ≤ N; if N > 18, a second stroke on the hardest (N−18) holes.";

export function formatByDay(day: number): FormatInfo | null {
  return FORMATS.find((f) => f.day === day) ?? null;
}

export function formatByKey(key: FormatKey): FormatInfo {
  return FORMATS.find((f) => f.key === key)!;
}
