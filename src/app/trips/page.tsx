import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createTrip } from "./actions";

export default async function TripsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: trips } = await supabase
    .from("trips")
    .select("id, name, location, starts_on, ends_on")
    .order("starts_on", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold text-fairway-700">Your Trips</h1>
      </div>

      <div className="card">
        <h2 className="font-semibold">New trip</h2>
        <form action={createTrip} className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="Bobo Trip 2026" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Location</label>
            <input name="location" className="input" placeholder="Pinehurst, NC" />
          </div>
          <div>
            <label className="label">Starts</label>
            <input name="starts_on" type="date" className="input" />
          </div>
          <div>
            <label className="label">Ends</label>
            <input name="ends_on" type="date" className="input" />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button className="btn w-full">Create trip</button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(trips ?? []).map((t) => (
          <Link key={t.id} href={`/trips/${t.id}`} className="card hover:shadow-md transition">
            <h3 className="text-lg font-semibold text-fairway-700">{t.name}</h3>
            <p className="text-sm text-fairway-900/70">{t.location ?? "Location TBD"}</p>
            <p className="text-xs mt-1 text-fairway-900/60">
              {t.starts_on ?? "?"} → {t.ends_on ?? "?"}
            </p>
          </Link>
        ))}
        {(trips ?? []).length === 0 && (
          <p className="text-sm text-fairway-900/70">
            No trips yet — create one above. Signed in as {user?.email}.
          </p>
        )}
      </div>
    </div>
  );
}
