import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function BetsPage() {
  const supabase = await createClient();

  const { data: bets } = await supabase
    .from("bets")
    .select("id, description, amount, status, trip_id, winner_id, trips(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-fairway-700">All Side Bets</h1>
      <div className="space-y-2">
        {(bets ?? []).map((b: any) => (
          <Link
            key={b.id}
            href={`/trips/${b.trip_id}`}
            className="block rounded-lg border border-fairway-100 bg-white p-3 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{b.description}</p>
              <span className="text-xs uppercase text-fairway-700">{b.status}</span>
            </div>
            <p className="text-xs text-fairway-900/60">
              ${Number(b.amount).toFixed(2)} · {b.trips?.name ?? "trip"}
            </p>
          </Link>
        ))}
        {(bets ?? []).length === 0 && (
          <p className="text-sm text-fairway-900/70">No bets yet across your trips.</p>
        )}
      </div>
    </div>
  );
}
