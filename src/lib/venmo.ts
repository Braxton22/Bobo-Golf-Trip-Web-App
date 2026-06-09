// Venmo deep links + debt simplification. Pure functions, no I/O.

/**
 * Build a Venmo "pay" link. Returns a web URL; on iOS / Android the OS will
 * deep-link into the Venmo app when installed. Honest note: Venmo's deep-link
 * spec is not perfectly stable — `amount` prefill is best-effort and may not
 * fire on every client/OS combo. Always render the amount alongside the link
 * so the user can confirm before tapping send.
 */
export function venmoPayUrl(opts: {
  username: string;
  amount: number;
  note?: string;
}): string {
  const u = opts.username.replace(/^@+/, "");
  const params = new URLSearchParams({
    txn: "pay",
    amount: opts.amount.toFixed(2),
    note: opts.note ?? "",
  });
  return `https://venmo.com/${encodeURIComponent(u)}?${params.toString()}`;
}

/** App-scheme deep link, for clients that prefer the venmo:// scheme. */
export function venmoAppUrl(opts: {
  username: string;
  amount: number;
  note?: string;
}): string {
  const u = opts.username.replace(/^@+/, "");
  const params = new URLSearchParams({
    txn: "pay",
    recipients: u,
    amount: opts.amount.toFixed(2),
    note: opts.note ?? "",
  });
  return `venmo://paycharge?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Debt simplification
// ---------------------------------------------------------------------------

export type Balance = { player_id: string; amount: number };

/**
 * Greedy debt simplification: given a list of net balances (positive =
 * creditor / owed money, negative = debtor / owes money), return the smallest
 * possible list of pairwise transfers that settle everyone.
 *
 * Optimal min-transactions is NP-hard in general; greedy max-debtor /
 * max-creditor matching is the standard practical heuristic and produces
 * "minimum cash flow" for typical N <= 12 groups. Within rounding tolerance
 * (cents) totals net to zero.
 */
export function simplifyDebts(balances: Balance[]): {
  player_id_from: string;
  player_id_to: string;
  amount: number;
}[] {
  const EPS = 0.005;
  // Normalize to cents to avoid float drift.
  const cents = balances
    .map((b) => ({ player_id: b.player_id, amount: Math.round(b.amount * 100) }))
    .filter((b) => Math.abs(b.amount) > 0);

  // Group by player in case the caller passed dupes.
  const byPlayer = new Map<string, number>();
  for (const b of cents) byPlayer.set(b.player_id, (byPlayer.get(b.player_id) ?? 0) + b.amount);

  const debtors = [...byPlayer.entries()].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c }));
  const creditors = [...byPlayer.entries()].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }));

  const transfers: { player_id_from: string; player_id_to: string; amount: number }[] = [];

  // Sort by magnitude descending so we always match the largest debt to the
  // largest credit on each pass.
  debtors.sort((a, b) => a.c - b.c); // most negative first
  creditors.sort((a, b) => b.c - a.c); // largest positive first

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const need = -debtors[i].c; // positive amount owed
    const have = creditors[j].c; // positive amount owed TO them
    const pay = Math.min(need, have);
    if (pay > 0) {
      transfers.push({
        player_id_from: debtors[i].id,
        player_id_to: creditors[j].id,
        amount: pay / 100,
      });
      debtors[i].c += pay;
      creditors[j].c -= pay;
    }
    if (Math.abs(debtors[i].c) < 1) i++;
    if (Math.abs(creditors[j].c) < 1) j++;
  }

  void EPS;
  return transfers;
}

/**
 * Given the raw who-owes-whom edges from bets, fold them into per-player
 * net balances. Loser pays winner -> negative for loser, positive for winner.
 */
export function rollupBalances(
  edges: { from: string; to: string; amount: number }[]
): Balance[] {
  const m = new Map<string, number>();
  for (const e of edges) {
    m.set(e.from, (m.get(e.from) ?? 0) - e.amount);
    m.set(e.to, (m.get(e.to) ?? 0) + e.amount);
  }
  return [...m.entries()].map(([player_id, amount]) => ({
    player_id,
    amount: Math.round(amount * 100) / 100,
  }));
}
