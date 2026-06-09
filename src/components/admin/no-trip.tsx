import Link from "next/link";
import { Plus } from "lucide-react";

export function NoTrip() {
  return (
    <div className="card text-center space-y-3">
      <h2 className="font-serif text-xl font-semibold">No active trip</h2>
      <p className="text-sm text-muted-foreground">
        Create a trip to start configuring teams, players, and matches.
      </p>
      <Link href="/admin/trips" className="btn inline-flex gap-1.5">
        <Plus className="h-4 w-4" />
        Create a trip
      </Link>
    </div>
  );
}
