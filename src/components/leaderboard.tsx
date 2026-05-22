"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  formatToPar,
  toParTone,
  withPositions,
  type LeaderboardRow,
} from "@/lib/scoring";

const toneClass: Record<string, string> = {
  under: "text-score-under",
  even: "text-score-even",
  over: "text-score-over",
};

export function Leaderboard({
  rows,
  live = false,
  compact = false,
  className,
  emptyLabel = "No scores posted yet.",
}: {
  rows: LeaderboardRow[];
  live?: boolean;
  compact?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const ranked = withPositions(rows);
  const prevNets = useRef<Map<string, number | null>>(new Map());
  const changed = new Set<string>();

  for (const row of ranked) {
    const prev = prevNets.current;
    if (prev.size > 0 && prev.has(row.id) && prev.get(row.id) !== row.net) {
      changed.add(row.id);
    }
  }

  useEffect(() => {
    prevNets.current = new Map(ranked.map((r) => [r.id, r.net]));
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-soft",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-2.5 text-primary-foreground">
        <h3 className="font-serif text-base font-semibold tracking-wide">Leaderboard</h3>
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-destructive-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-live-pulse" />
            Live
          </span>
        )}
      </div>

      {ranked.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Pos</th>
              <th className="py-2 text-left font-semibold">Player</th>
              {!compact && <th className="py-2 text-center font-semibold">Thru</th>}
              <th className="py-2 text-right font-semibold">Net</th>
              <th className="px-4 py-2 text-right font-semibold">To Par</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => {
              const tone = toParTone(row.toPar);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t border-border transition-colors",
                    changed.has(row.id) && "animate-score-flash"
                  )}
                >
                  <td className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                    {row.position}
                  </td>
                  <td className="py-2.5 text-left font-medium">{row.name}</td>
                  {!compact && (
                    <td className="py-2.5 text-center text-muted-foreground">
                      {row.thru || "—"}
                    </td>
                  )}
                  <td className="py-2.5 text-right font-semibold">{row.net ?? "—"}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-bold",
                      toneClass[tone]
                    )}
                  >
                    {formatToPar(row.toPar)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
