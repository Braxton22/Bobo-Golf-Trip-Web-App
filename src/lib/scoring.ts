// Back-compat shim. The real scoring engine lives in /lib/scoring/*.
// Older pages still import the simple trip-level leaderboard from here.
//
// Re-export the new engine alongside, so new code can import either path.
export * from "./scoring/index";

const DEFAULT_PAR = 72;

export type ScoreInput = {
  round_id: string;
  profile_id: string;
  total_strokes: number | null;
};

export type RoundInput = {
  id: string;
  par: number | null;
};

export type MemberInput = {
  id: string;
  display_name: string;
  handicap: number | null;
};

export type LeaderboardRow = {
  id: string;
  name: string;
  handicap: number;
  thru: number;
  gross: number | null;
  net: number | null;
  toPar: number | null;
};

/**
 * Legacy trip-level leaderboard used by the existing trips/page until the new
 * per-hole flow replaces it. Net total = gross total − (handicap × rounds).
 */
export function computeLeaderboard(
  members: MemberInput[],
  rounds: RoundInput[],
  scores: ScoreInput[]
): LeaderboardRow[] {
  const parById = new Map(rounds.map((r) => [r.id, r.par ?? DEFAULT_PAR]));

  const rows: LeaderboardRow[] = members.map((m) => {
    const posted = scores.filter((s) => s.profile_id === m.id && s.total_strokes != null);
    const handicap = m.handicap ?? 0;
    const thru = posted.length;

    if (thru === 0) {
      return { id: m.id, name: m.display_name, handicap, thru: 0, gross: null, net: null, toPar: null };
    }

    const gross = posted.reduce((a, s) => a + (s.total_strokes ?? 0), 0);
    const parPlayed = posted.reduce((a, s) => a + (parById.get(s.round_id) ?? DEFAULT_PAR), 0);
    const net = gross - handicap * thru;

    return { id: m.id, name: m.display_name, handicap, thru, gross, net, toPar: net - parPlayed };
  });

  return rows.sort((a, b) => {
    if (a.net == null && b.net == null) return a.name.localeCompare(b.name);
    if (a.net == null) return 1;
    if (b.net == null) return -1;
    return a.net - b.net;
  });
}

export function withPositions(rows: LeaderboardRow[]): (LeaderboardRow & { position: string })[] {
  let lastNet: number | null = null;
  let lastPos = 0;

  return rows.map((row, index) => {
    if (row.net == null) return { ...row, position: "—" };
    if (lastNet == null || row.net !== lastNet) {
      lastPos = index + 1;
      lastNet = row.net;
    }
    const tied = rows.filter((r) => r.net === row.net).length > 1;
    return { ...row, position: `${tied ? "T" : ""}${lastPos}` };
  });
}
