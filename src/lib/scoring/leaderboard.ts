import { courseHandicap, allocateStrokes } from "./handicap";
import type { Course, HandicapMode, HoleScore } from "./types";

export type RoundLeaderboardRow = {
  player_id: string;
  name: string;
  index: number;
  courseHandicap: number;
  thru: number; // holes posted
  gross: number | null;
  net: number | null;
  toPar: number | null; // net - par-played
};

/**
 * Net round leaderboard — for a single day. Each entry shows the player's
 * gross, net, and net-to-par "thru N holes". Used for the round board (§5.5.1).
 */
export function computeRoundLeaderboard(
  players: { id: string; name: string; index: number }[],
  scoresByPlayer: Record<string, HoleScore[]>,
  course: Course,
  mode: HandicapMode = "simple"
): RoundLeaderboardRow[] {
  const parByHole = new Map(course.holes.map((h) => [h.hole_number, h.par]));

  const rows = players.map((p) => {
    const scores = scoresByPlayer[p.id] ?? [];
    const ch = courseHandicap({ index: p.index }, course, mode);
    const strokes = allocateStrokes(ch, course.holes);

    let gross = 0;
    let net = 0;
    let parPlayed = 0;
    for (const s of scores) {
      gross += s.gross;
      net += s.gross - (strokes.get(s.hole_number) ?? 0);
      parPlayed += parByHole.get(s.hole_number) ?? 4;
    }

    if (scores.length === 0) {
      return {
        player_id: p.id,
        name: p.name,
        index: p.index,
        courseHandicap: ch,
        thru: 0,
        gross: null,
        net: null,
        toPar: null,
      };
    }

    return {
      player_id: p.id,
      name: p.name,
      index: p.index,
      courseHandicap: ch,
      thru: scores.length,
      gross,
      net,
      toPar: net - parPlayed,
    };
  });

  // Lowest toPar first; null toPar to the bottom; tiebreak by name.
  return rows.sort((a, b) => {
    if (a.toPar == null && b.toPar == null) return a.name.localeCompare(b.name);
    if (a.toPar == null) return 1;
    if (b.toPar == null) return -1;
    if (a.toPar !== b.toPar) return a.toPar - b.toPar;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Ryder Cup standings — pure totals from a list of completed-or-provisional
 * match results. Pass match-play points per side; we sum into a team total.
 *
 * pointsPerMatch defaults to 1 per the spec; tieOutcomeLabel is what's shown
 * when both teams end with exactly half the total (6.0 in the 12-point format).
 */
export function computeCupStandings(
  matches: { team_a_points: number; team_b_points: number }[],
  opts?: {
    pointsToWin?: number; // default 6.5 for a 12-point format
    totalPoints?: number; // default 12
    tieOutcomeLabel?: string;
  }
): {
  teamAPoints: number;
  teamBPoints: number;
  pointsRemaining: number;
  status: "in_progress" | "decided" | "tie";
  winner: "A" | "B" | "tie" | null;
  scoreline: string;
} {
  const totalPoints = opts?.totalPoints ?? 12;
  const pointsToWin = opts?.pointsToWin ?? 6.5;
  const tieLabel = opts?.tieOutcomeLabel ?? "Cup retained / shared";

  const teamAPoints = matches.reduce((acc, m) => acc + m.team_a_points, 0);
  const teamBPoints = matches.reduce((acc, m) => acc + m.team_b_points, 0);
  const decided = matches.reduce((acc, m) => acc + m.team_a_points + m.team_b_points, 0);
  const pointsRemaining = Math.max(0, totalPoints - decided);

  if (teamAPoints >= pointsToWin) {
    return {
      teamAPoints,
      teamBPoints,
      pointsRemaining,
      status: "decided",
      winner: "A",
      scoreline: formatScoreline(teamAPoints, teamBPoints),
    };
  }
  if (teamBPoints >= pointsToWin) {
    return {
      teamAPoints,
      teamBPoints,
      pointsRemaining,
      status: "decided",
      winner: "B",
      scoreline: formatScoreline(teamAPoints, teamBPoints),
    };
  }
  if (pointsRemaining === 0) {
    // Round-trip completed; if neither hit pointsToWin, it's a tie.
    return {
      teamAPoints,
      teamBPoints,
      pointsRemaining: 0,
      status: "tie",
      winner: "tie",
      scoreline: `${formatScoreline(teamAPoints, teamBPoints)} — ${tieLabel}`,
    };
  }
  return {
    teamAPoints,
    teamBPoints,
    pointsRemaining,
    status: "in_progress",
    winner: null,
    scoreline: formatScoreline(teamAPoints, teamBPoints),
  };
}

// "6½ – 5½" style scoreline. Halves render as the unicode fraction so the board
// reads like a real leaderboard.
function formatScoreline(a: number, b: number): string {
  return `${fmtHalf(a)} – ${fmtHalf(b)}`;
}

function fmtHalf(n: number): string {
  const whole = Math.trunc(n);
  const half = Math.abs(n - whole) >= 0.4999;
  return half ? `${whole}½` : `${whole}`;
}
