// Single source of truth for round formats across both trip types.
// Ryder Cup trips use the three classic team formats; casual trips pick a
// format per round from the casual list. UI labels, entry rules, and scoring
// blurbs all live here so the scorecard, leaderboard, format page, and admin
// stay in sync.

import type { RoundFormat, TripType } from "@/lib/db";

export const RYDER_CUP_FORMATS: RoundFormat[] = ["scramble", "best_ball_bonus", "singles"];

export const CASUAL_FORMATS: RoundFormat[] = [
  "medal",
  "stableford",
  "skins",
  "count_birdies",
  "match_play",
  "group_scramble",
];

export function formatsForTripType(t: TripType): RoundFormat[] {
  return t === "ryder_cup" ? RYDER_CUP_FORMATS : CASUAL_FORMATS;
}

/** Solo formats: every player logs their own ball; scores have no match. */
export function isSoloFormat(f: RoundFormat): boolean {
  return f === "medal" || f === "stableford" || f === "skins" || f === "count_birdies";
}

/** Formats whose rounds are organized as matches (sides A/B). */
export function isMatchFormat(f: RoundFormat): boolean {
  return f === "scramble" || f === "best_ball_bonus" || f === "singles" || f === "match_play";
}

export const FORMAT_LABEL: Record<RoundFormat, string> = {
  scramble: "Scramble",
  best_ball_bonus: "Best Ball + Bonus",
  singles: "Singles",
  medal: "Medal play",
  stableford: "Stableford",
  skins: "Skins",
  count_birdies: "Count your birdies",
  match_play: "Match play",
  group_scramble: "Scramble",
};

export type FormatMeta = {
  key: RoundFormat;
  label: string;
  size: string; // "own ball", "1v1", "group"
  entryRule: string;
  scoringRule: string;
};

export const FORMAT_META: Record<RoundFormat, FormatMeta> = {
  scramble: {
    key: "scramble",
    label: "Scramble",
    size: "2-man team",
    entryRule:
      "ONE gross per hole, entered for the team. Either teammate can post — your partner doesn't need to re-enter.",
    scoringRule:
      "Team handicap = round(0.35 × lower partner's index + 0.15 × higher partner's index). Each team plays off its own handicap, full strokes by stroke index.",
  },
  best_ball_bonus: {
    key: "best_ball_bonus",
    label: "Best Ball + Bonus",
    size: "2-man team",
    entryRule: "EACH partner plays their own ball, so each partner enters their own gross per hole.",
    scoringRule:
      "Each partner's net = gross − strokes received. Team hole = better of the two nets, with a −1 bonus when BOTH partners make net par-or-better.",
  },
  singles: {
    key: "singles",
    label: "Singles",
    size: "1v1",
    entryRule: "Each player enters their own gross per hole.",
    scoringRule: "Full handicap by stroke index. Lower net wins the hole; match play through 18.",
  },
  medal: {
    key: "medal",
    label: "Medal play",
    size: "own ball",
    entryRule: "Everyone plays their own ball and logs their own gross per hole.",
    scoringRule:
      "Straight stroke play. Net = gross − strokes by stroke index. The board shows gross, net, and net-to-par. No matches, no points — just post a number.",
  },
  stableford: {
    key: "stableford",
    label: "Stableford",
    size: "own ball",
    entryRule: "Everyone plays their own ball and logs their own gross per hole.",
    scoringRule:
      "Points per hole off your NET score: bogey 1, par 2, birdie 3, eagle 4, albatross 5, double-bogey or worse 0. Highest points wins — a blow-up hole costs you nothing extra.",
  },
  skins: {
    key: "skins",
    label: "Skins",
    size: "own ball",
    entryRule: "Everyone plays their own ball and logs their own gross per hole.",
    scoringRule:
      "Lowest UNIQUE net on a hole wins the skin. Ties carry the pot to the next hole, so a tied hole makes the next one worth more. A hole settles once every player has posted it.",
  },
  count_birdies: {
    key: "count_birdies",
    label: "Count your birdies",
    size: "own ball",
    entryRule: "Everyone plays their own ball and logs their own gross per hole.",
    scoringRule:
      "GROSS birdies only: birdie = 2 pts, eagle or better = 4 pts. Points add up across the whole trip, and the back nine of the final round counts DOUBLE.",
  },
  match_play: {
    key: "match_play",
    label: "Match play",
    size: "1v1",
    entryRule: "Each player enters their own gross per hole.",
    scoringRule:
      "Full handicap by stroke index. Lower net wins the hole; classic UP/DOWN match play through 18. No teams — just you and them.",
  },
  group_scramble: {
    key: "group_scramble",
    label: "Scramble",
    size: "group",
    entryRule:
      "ONE gross per hole for the whole group — anyone in the group can post it.",
    scoringRule:
      "Everyone tees off, play the best ball each shot. The board ranks groups by gross to par — no handicaps, winner buys nothing.",
  },
};

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  ryder_cup: "Ryder Cup",
  casual: "Casual",
};
