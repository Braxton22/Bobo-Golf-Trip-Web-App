import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Bet, BetParticipant, Player } from "@/lib/db";
import { venmoPayUrl } from "@/lib/venmo";
import { Field, SubmitButton } from "@/components/admin/section";
import { cancelBetAction, reopenBetAction, settleBetAction } from "../actions";

const TYPE_LABEL: Record<Bet["type"], string> = {
  match: "Match",
  longest_drive: "Longest drive",
  closest_to_pin: "Closest to pin",
  hole_score: "Hole score",
  low_net_round: "Low net round",
  skins: "Skins",
  other: "Other",
};

type Props = { params: Promise<{ id: string }> };

export default async function BetDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bets/${id}`);

  const trip = await getActiveTrip();
  if (!trip) redirect("/bets");

  const { data: betRow } = await supabase.from("bets").select("*").eq("id", id).maybeSingle();
  const bet = betRow as Bet | null;
  if (!bet || bet.trip_id !== trip.id) redirect("/bets");

  const [{ data: partsRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from("bet_participants").select("*").eq("bet_id", bet!.id),
    supabase.from("players").select("*").eq("trip_id", trip.id),
  ]);
  const parts = (partsRaw ?? []) as BetParticipant[];
  const players = (playersRaw ?? []) as Player[];
  const playerById = new Map(players.map((p) => [p.id, p]));

  const winners = parts.filter((p) => p.is_winner);
  const losers = parts.filter((p) => !p.is_winner);

  // Even split among winners.
  const totalPot = Number(bet!.amount) * losers.length;
  const perWinner = winners.length > 0 ? totalPot / winners.length : 0;

  return (
    <div className="space-y-5">
      <Link
        href="/bets"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Bets
      </Link>
      <header className="card space-y-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {TYPE_LABEL[bet!.type]}
          {bet!.hole_number ? ` · Hole ${bet!.hole_number}` : ""}
        </p>
        <h1 className="font-serif text-2xl font-semibold">{bet!.description ?? "Side bet"}</h1>
        <p className="text-sm">
          <span className="font-medium">${Number(bet!.amount).toFixed(2)}</span>{" "}
          <span className="text-muted-foreground">per loser → split among winners</span>
        </p>
        <p className="text-xs uppercase tracking-wide">
          <span
            className={
              bet!.status === "open"
                ? "text-[hsl(var(--green))]"
                : bet!.status === "settled"
                  ? "text-muted-foreground"
                  : "text-destructive"
            }
          >
            Status: {bet!.status}
          </span>
        </p>
      </header>

      {/* Settle form (open bets) */}
      {bet!.status === "open" && (
        <form action={settleBetAction} className="card space-y-3">
          <input type="hidden" name="bet_id" value={bet!.id} />
          <Field label="Pick the winner(s)">
            <ul className="space-y-2">
              {parts.map((p) => {
                const player = playerById.get(p.player_id);
                return (
                  <li key={p.player_id}>
                    <label className="flex items-center gap-2 rounded-xl border border-line bg-background/40 p-2.5">
                      <input
                        type="checkbox"
                        name="winner_ids"
                        value={p.player_id}
                        defaultChecked={p.is_winner}
                        className="h-5 w-5 rounded border-line text-primary focus:ring-primary"
                      />
                      <span className="text-sm">{player?.name ?? "—"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>Settle bet</SubmitButton>
            <button
              formAction={cancelBetAction}
              className="btn-ghost inline-flex items-center gap-1.5 text-sm"
              type="submit"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Settled — show winner / loser breakdown + Venmo links */}
      {bet!.status === "settled" && (
        <>
          <section className="card space-y-2">
            <h2 className="font-medium">Result</h2>
            <p className="text-sm">
              Winner{winners.length > 1 ? "s" : ""}:{" "}
              {winners.length === 0
                ? "—"
                : winners.map((w) => playerById.get(w.player_id)?.name ?? "?").join(", ")}
            </p>
            {winners.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Pot ${totalPot.toFixed(2)} split → ${perWinner.toFixed(2)} per winner
              </p>
            )}
          </section>

          {winners.length > 0 && losers.length > 0 && (
            <section className="card space-y-2">
              <h2 className="font-medium">Pay on Venmo</h2>
              <p className="text-xs text-muted-foreground">
                Best-effort prefill — Venmo doesn't always read the amount, so the number is shown
                here too. No money moves until you confirm in the app.
              </p>
              <ul className="space-y-2">
                {losers.flatMap((l) =>
                  winners.map((w) => {
                    const loser = playerById.get(l.player_id);
                    const winner = playerById.get(w.player_id);
                    if (!loser || !winner || !winner.venmo_username) return null;
                    const amount = Number(bet!.amount) / winners.length;
                    const note = `${TYPE_LABEL[bet!.type]}: ${bet!.description ?? ""}`.slice(0, 100);
                    const href = venmoPayUrl({
                      username: winner.venmo_username,
                      amount,
                      note,
                    });
                    return (
                      <li
                        key={`${l.player_id}-${w.player_id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background/40 p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm">
                            <strong>{loser.name}</strong>
                            <span className="text-muted-foreground"> pays </span>
                            <strong>{winner.name}</strong>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${amount.toFixed(2)} · @{winner.venmo_username.replace(/^@+/, "")}
                          </div>
                        </div>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn inline-flex items-center gap-1.5 text-xs"
                        >
                          Pay <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    );
                  })
                )}
              </ul>
              {losers.some((l) => {
                const w = winners[0];
                return w && !playerById.get(w.player_id)?.venmo_username;
              }) && (
                <p className="text-xs text-destructive">
                  One or more winners haven't added a Venmo username — they can do it from /join/&lt;code&gt;.
                </p>
              )}
            </section>
          )}

          <form action={reopenBetAction}>
            <input type="hidden" name="bet_id" value={bet!.id} />
            <button className="btn-ghost inline-flex items-center gap-1.5 text-sm" type="submit">
              <RotateCcw className="h-3.5 w-3.5" />
              Re-open
            </button>
          </form>
        </>
      )}

      {/* Participants list (always shown) */}
      <section className="card space-y-2">
        <h2 className="font-medium">In on this bet</h2>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {parts.map((p) => {
            const player = playerById.get(p.player_id);
            return (
              <li key={p.player_id} className="rounded-lg bg-background/40 px-2 py-1.5">
                {player?.name ?? "?"}
                {p.is_winner && <span className="ml-1 text-[10px] text-[hsl(var(--score-under))]">WIN</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
