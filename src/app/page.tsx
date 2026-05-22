import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      <section className="card">
        <h1 className="text-3xl font-bold text-fairway-700">Welcome to the Bobo Golf Trip</h1>
        <p className="mt-2 text-fairway-900/80">
          Track rounds, log Airbnbs, and settle side bets between the boys. Built for the trip,
          tuned by the trip.
        </p>
        <div className="mt-4">
          {user ? (
            <Link href="/trips" className="btn">Go to your trips</Link>
          ) : (
            <Link href="/login" className="btn">Sign in to get started</Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <h2 className="font-semibold">⛳ Rounds</h2>
          <p className="text-sm text-fairway-900/70">
            Log courses, dates, and every player's score.
          </p>
        </div>
        <div className="card">
          <h2 className="font-semibold">🏠 Airbnbs</h2>
          <p className="text-sm text-fairway-900/70">
            Save where you're staying, costs, and check-in info.
          </p>
        </div>
        <div className="card">
          <h2 className="font-semibold">💸 Side Bets</h2>
          <p className="text-sm text-fairway-900/70">
            Propose bets, settle them, keep score across the trip.
          </p>
        </div>
      </section>
    </div>
  );
}
