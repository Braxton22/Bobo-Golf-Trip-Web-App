import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, DollarSign, Plus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Bet, BetParticipant, Player } from "@/lib/db";

const TYPE_LABEL: Record<Bet["type"], string> = {
  match: "Match",
  longest_drive: "Longest drive",
  closest_to_pin: "Closest to pin",
  hole_score: "Hole score",
  low_net_round: "Low net round",
  skins: "Skins",
  other: "Other",
};

export default async function BetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bets");

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
        <p className="text-sm text-muted-foreground">
          Join or create a trip to start tracking side action.
        </p>
      </div>
    );
  }

  const [{ data: betsRaw }, { data: participantsRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from("bets").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
    supabase
      .from("bet_participants")
      .select("bet_id, player_id, is_winner")
      .in(
        "bet_id",
        (await supabase.from("bets").select("id").eq("trip_id", trip.id)).data?.map((b) => b.id as string) ?? []
      ),
    supabase.from("players").select("*").eq("trip_id", trip.id),
  ]);
  const bets = (betsRaw ?? []) as Bet[];
  const parts = (participantsRaw ?? []) as BetParticipant[];
  const players = (playersRaw ?? []) as Player[];

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const partsByBet = new Map<string, BetParticipant[]>();
  for (const p of parts) {
    if (!partsByBet.has(p.bet_id)) partsByBet.set(p.bet_id, []);
    partsByBet.get(p.bet_id)!.push(p);
  }

  const open = bets.filter((b) => b.status === "open");
  const settled = bets.filter((b) => b.status === "settled");
  const cancelled = bets.filter((b) => b.status === "cancelled");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Bets</h1>
          <p className="text-sm text-muted-foreground">
            {trip.name} · {bets.length} bet{bets.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/bets/settle-up"
            className="btn-ghost inline-flex items-center gap-1.5 text-sm"
          >
            <Wallet className="h-4 w-4" />
            Settle up
          </Link>
          <Link href="/bets/new" className="btn inline-flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            New bet
          </Link>
        </div>
      </header>

      <BetsGroup title="Open" bets={open} partsByBet={partsByBet} playerName={playerName} />
      <BetsGroup
        title="Settled"
        bets={settled}
        partsByBet={partsByBet}
        playerName={playerName}
        tone="muted"
      />
      {cancelled.length > 0 && (
        <BetsGroup
          title="Cancelled"
          bets={cancelled}
          partsByBet={partsByBet}
          playerName={playerName}
          tone="muted"
        />
      )}
    </div>
  );
}

function BetsGroup({
  title,
  bets,
  partsByBet,
  playerName,
  tone,
}: {
  title: string;
  bets: Bet[];
  partsByBet: Map<string, BetParticipant[]>;
  playerName: (id: string) => string;
  tone?: "muted";
}) {
  if (bets.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      <ul className="space-y-2">
        {bets.map((b) => {
          const ps = partsByBet.get(b.id) ?? [];
          const winners = ps.filter((p) => p.is_winner).map((p) => playerName(p.player_id));
          return (
            <li key={b.id}>
              <Link
                href={`/bets/${b.id}`}
                className={`card flex items-center gap-3 transition hover:shadow-lift ${tone === "muted" ? "opacity-80" : ""}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {TYPE_LABEL[b.type]}{b.hole_number ? ` · Hole ${b.hole_number}` : ""}
                  </div>
                  <div className="mt-0.5 font-medium truncate">
                    {b.description ?? "Side bet"}
                  </div>
                  {winners.length > 0 && (
                    <div className="text-[11px] text-[hsl(var(--score-under))]">
                      Winner: {winners.join(", ")}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-serif text-xl font-semibold tabular-nums">
                    ${Number(b.amount).toFixed(0)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{ps.length} in</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
