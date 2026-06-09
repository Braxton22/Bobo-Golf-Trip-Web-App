import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Bet, BetParticipant, Player } from "@/lib/db";
import { rollupBalances, simplifyDebts, venmoPayUrl } from "@/lib/venmo";

export default async function SettleUpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bets/settle-up");

  const trip = await getActiveTrip();
  if (!trip) redirect("/bets");

  const [{ data: betsRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from("bets").select("*").eq("trip_id", trip.id).eq("status", "settled"),
    supabase.from("players").select("*").eq("trip_id", trip.id),
  ]);
  const bets = (betsRaw ?? []) as Bet[];
  const players = (playersRaw ?? []) as Player[];
  let parts: BetParticipant[] = [];
  if (bets.length > 0) {
    const { data } = await supabase
      .from("bet_participants")
      .select("*")
      .in("bet_id", bets.map((b) => b.id));
    parts = (data ?? []) as BetParticipant[];
  }

  // For each settled bet: each loser owes (amount) to the winner pool, split
  // evenly among winners. Build the raw edges and roll up into balances.
  const edges: { from: string; to: string; amount: number }[] = [];
  for (const bet of bets) {
    const bp = parts.filter((p) => p.bet_id === bet.id);
    const winners = bp.filter((p) => p.is_winner);
    const losers = bp.filter((p) => !p.is_winner);
    if (winners.length === 0 || losers.length === 0) continue;
    const perWinner = Number(bet.amount) / winners.length;
    for (const l of losers) {
      for (const w of winners) {
        edges.push({ from: l.player_id, to: w.player_id, amount: perWinner });
      }
    }
  }

  const balances = rollupBalances(edges);
  const simplified = simplifyDebts(balances);
  const playerById = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      <Link
        href="/bets"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Bets
      </Link>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold">Settle up</h1>
          <p className="text-sm text-muted-foreground">
            Fewest possible Venmo transactions to clear every settled bet.
          </p>
        </div>
      </header>

      {/* Raw balances */}
      <section className="card">
        <h2 className="font-medium">Running tally</h2>
        {balances.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No settled bets yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {balances
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .map((b) => {
                const name = playerById.get(b.player_id)?.name ?? "?";
                const positive = b.amount > 0;
                const negative = b.amount < 0;
                return (
                  <li key={b.player_id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{name}</span>
                    <span
                      className={`font-medium tabular-nums ${
                        positive
                          ? "text-[hsl(var(--score-under))]"
                          : negative
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {positive ? `+ $${b.amount.toFixed(2)}` : `- $${Math.abs(b.amount).toFixed(2)}`}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Simplified plan */}
      {simplified.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-medium">Simplified plan ({simplified.length} payments)</h2>
          <p className="text-xs text-muted-foreground">
            Tap "Pay" to open Venmo. Amount is best-effort prefilled.
          </p>
          <ul className="space-y-2">
            {simplified.map((t, i) => {
              const from = playerById.get(t.player_id_from);
              const to = playerById.get(t.player_id_to);
              const venmo = to?.venmo_username;
              const note = `Trip settle-up · ${trip.name}`;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background/40 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm">
                      <strong>{from?.name ?? "?"}</strong>
                      <span className="text-muted-foreground"> pays </span>
                      <strong>{to?.name ?? "?"}</strong>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${t.amount.toFixed(2)}
                      {venmo ? ` · @${venmo.replace(/^@+/, "")}` : " · no Venmo linked"}
                    </div>
                  </div>
                  {venmo ? (
                    <a
                      href={venmoPayUrl({ username: venmo, amount: t.amount, note })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn inline-flex items-center gap-1.5 text-xs"
                    >
                      Pay <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-destructive">Add Venmo</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
