import { Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BetCard } from "@/components/trip-list/bet-card";
import { EmptyState } from "@/components/trip-list/empty-state";

export default async function BetsPage() {
  const supabase = await createClient();

  const { data: bets } = await supabase
    .from("bets")
    .select("id, description, amount, status, trip_id, winner_id, trips(name)")
    .order("created_at", { ascending: false });

  const betList = ((bets ?? []) as unknown as Array<{
    id: string;
    description: string | null;
    amount: number | string | null;
    status: string | null;
    trip_id: string;
    trips?: { name: string | null } | { name: string | null }[] | null;
  }>).map((bet) => ({
    ...bet,
    trips: Array.isArray(bet.trips) ? bet.trips[0] ?? null : bet.trips ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-10 py-4">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          The Wager Book
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          All Side Bets
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Track every wager across your trips — who is in, who is out, and what is on the line.
        </p>
      </header>

      {betList.length > 0 ? (
        <div className="space-y-3">
          {betList.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Coins}
          title="No bets yet"
          description="Side bets proposed on your trips will appear here. Open a trip to get the action started."
        />
      )}
    </div>
  );
}
