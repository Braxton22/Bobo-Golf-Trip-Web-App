"use client";

// Inline "Place a match bet" form. Lives on /bets so a player doesn't have to
// dig into a separate flow. Hides itself by default to keep the page tight.

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { placeMatchBetAction } from "./actions";

type MatchOpt = {
  id: string;
  number: number;
  round_id: string;
  day_number: number;
  side_a_label: string;
  side_b_label: string;
  /** Which sides am I allowed to back?  Always one or both of A/B. */
  allowed: ("A" | "B")[];
};

type Props = {
  matches: MatchOpt[];
};

export function PlaceBetForm({ matches }: Props) {
  const [open, setOpen] = useState(false);
  const [matchId, setMatchId] = useState<string>(matches[0]?.id ?? "");
  const [side, setSide] = useState<"A" | "B" | "">("");
  const [amount, setAmount] = useState<string>("");

  const selected = useMemo(() => matches.find((m) => m.id === matchId), [matches, matchId]);

  // When the match changes, drop the side if it's no longer allowed.
  useMemo(() => {
    if (side && selected && !selected.allowed.includes(side)) setSide("");
  }, [selected, side]);

  if (matches.length === 0) {
    return (
      <section className="card">
        <p className="text-sm text-muted-foreground">
          No matches available to bet on yet — the admin needs to set up tomorrow's
          matches before betting opens.
        </p>
      </section>
    );
  }

  return (
    <section className="card space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <Plus className="h-4 w-4 text-primary" />
          Place a bet
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <form action={placeMatchBetAction} className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Match
            </label>
            <select
              name="match_id"
              className="input"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              required
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  Day {m.day_number} · Match {m.number} — {m.side_a_label} vs {m.side_b_label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              I'm backing
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["A", "B"] as const).map((s) => {
                const allowed = selected?.allowed.includes(s) ?? false;
                const label = s === "A" ? selected?.side_a_label ?? "Side A" : selected?.side_b_label ?? "Side B";
                return (
                  <label
                    key={s}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-sm transition ${
                      side === s
                        ? "border-primary bg-primary/10"
                        : allowed
                          ? "border-line bg-background/40 hover:bg-muted"
                          : "border-line bg-background/40 opacity-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="side"
                        value={s}
                        checked={side === s}
                        disabled={!allowed}
                        onChange={() => setSide(s)}
                        className="accent-[hsl(var(--primary))]"
                        required
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Side {s}
                      </span>
                    </span>
                    <span className="truncate font-medium">{label}</span>
                    {!allowed && (
                      <span className="text-[10px] text-muted-foreground">
                        You're playing this side — can't back your own opponent.
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input
                type="number"
                name="amount"
                min={1}
                step={1}
                className="input pl-7"
                placeholder="20"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!matchId || !side || !amount}
            className="btn w-full disabled:opacity-50"
          >
            Place bet
          </button>
          <p className="text-[11px] text-muted-foreground">
            Anyone else on the trip can take the other side. Bets lock when the
            round's first ball is hit.
          </p>
        </form>
      )}
    </section>
  );
}
