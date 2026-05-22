import { Plane } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createTrip } from "./actions";
import { NewTripCard } from "@/components/trip-list/new-trip-card";
import { TripCard } from "@/components/trip-list/trip-card";
import { EmptyState } from "@/components/trip-list/empty-state";

export default async function TripsPage() {
  const supabase = await createClient();

  const { data: trips } = await supabase
    .from("trips")
    .select("id, name, location, starts_on, ends_on")
    .order("starts_on", { ascending: false });

  const tripList = trips ?? [];

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-10 py-4">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          Bobo Golf Trip
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Your Trips
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Every round, every wager, every getaway — gathered in one elegant place.
        </p>
      </header>

      <NewTripCard action={createTrip} />

      <section className="space-y-5">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {tripList.length > 0 ? "All trips" : "Trips"}
        </h2>
        {tripList.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {tripList.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Plane}
            title="No trips yet"
            description="Create your first trip using the form above and start planning the next great round."
          />
        )}
      </section>
    </div>
  );
}
