"use client";

// Shared presentational pieces for per-hole score entry — used by both the
// match scorecard (/scorecard/[matchId]) and the solo round scorecard
// (/scorecard/round/[roundId]).

import { Minus, Plus, Cloud, CloudOff, Check, AlertTriangle } from "lucide-react";

export type SyncIndicator = "saved" | "queued" | "syncing" | "error";

export function indicatorFor(item: { status: string } | undefined): SyncIndicator {
  if (!item) return "saved";
  if (item.status === "queued") return "queued";
  if (item.status === "syncing") return "syncing";
  if (item.status === "error") return "error";
  return "saved";
}

export function Stepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  ariaLabel: string;
}) {
  const set = (n: number | null) => {
    if (n != null) {
      if (n < 1) n = 1;
      if (n > 15) n = 15;
    }
    onChange(n);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        className="tap rounded-full border border-line bg-background text-foreground active:bg-muted"
        onClick={() => set(value == null ? 4 : value - 1)}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-11 w-12 rounded-xl border border-input bg-background text-center text-lg font-semibold tabular-nums"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "") return set(null);
          const n = Number(v);
          if (!Number.isFinite(n)) return;
          set(Math.floor(n));
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        className="tap rounded-full border border-line bg-background text-foreground active:bg-muted"
        onClick={() => set(value == null ? 4 : value + 1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SyncDot({ status }: { status: SyncIndicator }) {
  const Icon = status === "saved" ? Check : status === "syncing" ? Cloud : status === "error" ? AlertTriangle : CloudOff;
  const cls =
    status === "saved"
      ? "text-green-soft"
      : status === "syncing"
        ? "text-primary"
        : status === "error"
          ? "text-destructive"
          : "text-muted-foreground";
  const label =
    status === "saved"
      ? "Saved"
      : status === "syncing"
        ? "Syncing…"
        : status === "error"
          ? "Will retry"
          : "Will sync";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </span>
  );
}

export type EntryHole = { hole_number: number; par: number; stroke_index: number };

export function HoleRow({
  hole,
  value,
  strokesReceived = 0,
  status,
  readOnly = false,
  badge,
  onChange,
}: {
  hole: EntryHole;
  value: number | null;
  strokesReceived?: number;
  status: SyncIndicator;
  readOnly?: boolean;
  /** Optional per-hole annotation shown under the stepper (e.g. "3 pts"). */
  badge?: string | null;
  onChange: (gross: number | null) => void;
}) {
  const net = value != null ? value - strokesReceived : null;

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="w-14">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hole</div>
        <div className="font-serif text-lg font-semibold tabular-nums">{hole.hole_number}</div>
      </div>
      <div className="w-16 text-[11px] leading-tight text-muted-foreground">
        Par {hole.par}
        <br />
        SI {hole.stroke_index}
        {strokesReceived > 0 && (
          <span className="ml-1 inline-flex items-center rounded-full bg-[hsl(var(--gold))]/20 px-1.5 text-[10px] font-medium text-[hsl(var(--ink))]">
            +{strokesReceived}
          </span>
        )}
      </div>
      <div className="ml-auto flex flex-col items-end gap-1">
        {readOnly ? (
          <span className="h-11 inline-flex items-center px-2 text-lg font-semibold tabular-nums text-muted-foreground">
            {value ?? "—"}
          </span>
        ) : (
          <Stepper value={value} onChange={onChange} ariaLabel={`Hole ${hole.hole_number} gross`} />
        )}
        <div className="flex items-center gap-2">
          {net != null && strokesReceived > 0 && (
            <span className="text-[11px] text-muted-foreground">net {net}</span>
          )}
          {badge && (
            <span className="text-[11px] font-medium text-primary">{badge}</span>
          )}
          {!readOnly && <SyncDot status={status} />}
        </div>
      </div>
    </li>
  );
}
