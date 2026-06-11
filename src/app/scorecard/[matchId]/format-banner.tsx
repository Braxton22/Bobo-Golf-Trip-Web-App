"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { FORMAT_META } from "@/lib/trip-formats";
import type { RoundFormat } from "@/lib/db";

/**
 * Inline format explainer on the scorecard. Collapsed by default — the
 * "Who enters?" line is always visible so a player on the tee box can confirm
 * "do I need to post for this hole?" in one glance.
 */
export function FormatBanner({ formatKey }: { formatKey: RoundFormat }) {
  const f = FORMAT_META[formatKey];
  const [open, setOpen] = useState(false);

  return (
    <section className="card space-y-2.5">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Info className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium">{f.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {f.size}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          aria-expanded={open}
        >
          {open ? "Hide" : "Rules"}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </header>

      <p className="rounded-xl bg-[hsl(var(--gold))]/15 px-3 py-2 text-xs text-[hsl(var(--ink))]">
        <strong>Who enters?</strong> {f.entryRule}
      </p>

      {open && (
        <div className="space-y-2 pt-1 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Scoring.</strong> {f.scoringRule}
          </p>
          <Link
            href="/format"
            className="inline-block text-[11px] underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Full format rules →
          </Link>
        </div>
      )}
    </section>
  );
}
