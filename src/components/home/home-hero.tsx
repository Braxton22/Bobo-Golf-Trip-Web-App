import { Clock, Flag, Trophy } from "lucide-react";

type HeroState =
  | { kind: "countdown"; weekday: string; days: number }
  | { kind: "in_progress"; dayNumber: number }
  | { kind: "complete" }
  | { kind: "ready" };

export function HomeHero({
  tripName,
  location,
  year,
  state,
}: {
  tripName: string;
  location: string | null;
  year: number;
  state: HeroState;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
      {/* Augusta green radial wash. Uses the themed --primary so it adapts
          to light mode too. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 70% at 0% 0%, hsl(var(--primary) / 0.22) 0%, transparent 60%), radial-gradient(80% 60% at 100% 100%, hsl(var(--gold) / 0.12) 0%, transparent 65%)",
        }}
      />

      {/* Faint flagstick silhouette in the top-right corner. */}
      <Flagstick className="pointer-events-none absolute -right-2 -top-2 h-44 w-44 text-[hsl(var(--primary))] opacity-[0.18] sm:h-56 sm:w-56" />

      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        {location ? `${location} · ${year}` : year}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
        {tripName}
      </h1>

      <div className="mt-3">
        <StateChip state={state} />
      </div>
    </section>
  );
}

function StateChip({ state }: { state: HeroState }) {
  if (state.kind === "countdown") {
    return (
      <Chip Icon={Clock} accent>
        Tees off {state.weekday} · {state.days} day{state.days === 1 ? "" : "s"}
      </Chip>
    );
  }
  if (state.kind === "in_progress") {
    return (
      <Chip Icon={Flag} accent live>
        Day {state.dayNumber} in progress
      </Chip>
    );
  }
  if (state.kind === "complete") {
    return (
      <Chip Icon={Trophy} accent gold>
        Trip complete
      </Chip>
    );
  }
  return <Chip Icon={Clock}>Ready for tee-off</Chip>;
}

function Chip({
  Icon,
  accent,
  gold,
  live,
  children,
}: {
  Icon: typeof Clock;
  accent?: boolean;
  gold?: boolean;
  live?: boolean;
  children: React.ReactNode;
}) {
  const palette = gold
    ? "border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.12)] text-[hsl(var(--ink))]"
    : accent
      ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
      : "border-border bg-card text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${palette}`}>
      <Icon className="h-3 w-3" />
      {children}
      {live && (
        <span className="relative ml-0.5 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary))] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
        </span>
      )}
    </span>
  );
}

function Flagstick({ className }: { className?: string }) {
  // Stylized flagstick: pole + triangular pennant + a tiny ball at the base.
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-hidden
      role="presentation"
    >
      <rect x="48" y="8" width="3" height="78" rx="1.5" />
      <path d="M51 8 L86 22 L51 34 Z" />
      <circle cx="50" cy="92" r="3.5" />
    </svg>
  );
}

export type { HeroState };
