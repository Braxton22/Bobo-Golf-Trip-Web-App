import Link from "next/link";
import { Calendar, Clock as ClockIcon, MapPin } from "lucide-react";

export type DayCard = {
  round_id: string;
  day_number: number;
  course_name: string | null;
  format_label: string;
  date_label: string | null;
  earliest_tee_time: string | null;
  my_tee_time: string | null;
  current: boolean;
};

export function DayStrip({ days }: { days: DayCard[] }) {
  if (days.length === 0) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {days.map((d) => (
        <li key={d.round_id}>
          <Link
            href={`/leaderboard?day=${d.day_number}`}
            className={`block rounded-2xl border p-3 transition hover:shadow-soft ${
              d.current
                ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.06)]"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                Day {d.day_number}
              </span>
              {d.current && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--primary))]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary))] opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
                  </span>
                  Live
                </span>
              )}
            </div>

            <p className="mt-2 truncate font-serif text-base font-semibold leading-tight">
              {d.course_name ?? "Course TBD"}
            </p>
            <p className="text-[11px] text-muted-foreground">{d.format_label}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
              {d.date_label && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {d.date_label}
                </span>
              )}
              {d.my_tee_time ? (
                <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--primary))]">
                  <ClockIcon className="h-3 w-3" />
                  You tee off {d.my_tee_time}
                </span>
              ) : d.earliest_tee_time ? (
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  First tee {d.earliest_tee_time}
                </span>
              ) : null}
              {d.course_name && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Tee sheet
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
