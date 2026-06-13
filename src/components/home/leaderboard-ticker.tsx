"use client";

// Masters-style rolling leaderboard. A horizontal track of score chips that
// scrolls continuously; the row set is duplicated so the loop is seamless.
// Pauses on hover/touch. Falls back to a normal scroll under reduced-motion
// (globals.css disables the animation there).

export type TickerRow = {
  player_id: string;
  name: string;
  scoreText: string;
  tone: "under" | "even" | "over";
  thru: number;
};

export function LeaderboardTicker({ rows }: { rows: TickerRow[] }) {
  if (rows.length === 0) return null;
  // Slower when there are more rows so the speed feels consistent.
  const duration = Math.max(18, rows.length * 4);
  const doubled = [...rows, ...rows];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-card">
      <div
        className="flex w-max animate-ticker gap-2 p-2"
        style={{ ["--ticker-duration" as string]: `${duration}s` }}
      >
        {doubled.map((r, i) => (
          <Chip key={`${r.player_id}-${i}`} row={r} />
        ))}
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
    </div>
  );
}

function Chip({ row }: { row: TickerRow }) {
  const color =
    row.tone === "under"
      ? "text-[hsl(var(--score-under))]"
      : row.tone === "over"
        ? "text-foreground"
        : "text-muted-foreground";
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-background/50 px-3 py-1.5">
      <span className="text-sm font-medium">{row.name}</span>
      <span className={`font-serif text-base font-semibold tabular-nums ${color}`}>
        {row.scoreText}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        thru {row.thru}
      </span>
    </div>
  );
}
