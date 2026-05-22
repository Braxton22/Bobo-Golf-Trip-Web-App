import Link from "next/link";
import { ArrowUpRight, Calendar, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";

type Trip = {
  id: string;
  name: string | null;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRange(starts: string | null, ends: string | null) {
  const start = formatDate(starts);
  const end = formatDate(ends);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "Dates to be announced";
}

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full p-6 transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-card-foreground">
            {trip.name ?? "Untitled Trip"}
          </h3>
          <ArrowUpRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden
          />
        </div>
        <dl className="mt-5 space-y-2.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <dd>{trip.location ?? "Location to be announced"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <dd>{formatRange(trip.starts_on, trip.ends_on)}</dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}
