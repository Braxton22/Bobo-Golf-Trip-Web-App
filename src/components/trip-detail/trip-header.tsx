import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TripHeader({
  name,
  location,
  startsOn,
  endsOn,
  playerCount,
}: {
  name: string;
  location: string | null;
  startsOn: string | null;
  endsOn: string | null;
  playerCount: number;
}) {
  const start = formatDate(startsOn);
  const end = formatDate(endsOn);
  const dateRange =
    start && end ? `${start} – ${end}` : start ?? end ?? "Dates TBD";

  return (
    <header className="animate-fade-in overflow-hidden rounded-2xl border border-border bg-primary text-primary-foreground shadow-lift">
      <div className="px-6 py-8 sm:px-10 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
          Bobo Golf Trip
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          {name}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-primary-foreground/85">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {location ?? "Location TBD"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {dateRange}
          </span>
          <Badge variant="accent">
            <Users className="h-3.5 w-3.5" />
            {playerCount} player{playerCount === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>
    </header>
  );
}
