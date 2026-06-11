import Link from "next/link";
import { ChevronLeft, Flag, Trophy, UserCheck, Users } from "lucide-react";
import { CUP_RULES, FORMATS, HANDICAP_BLURB } from "@/lib/format-info";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { CASUAL_FORMATS, FORMAT_META } from "@/lib/trip-formats";
import type { Round, RoundFormat } from "@/lib/db";

const ICON = {
  scramble: Users,
  best_ball_bonus: Users,
  singles: UserCheck,
} as const;

export default async function FormatPage() {
  // The explainer adapts to the active trip's type. Signed-out visitors (or
  // no active trip) get the classic Ryder Cup explainer.
  const trip = await getActiveTrip();
  const isRyder = !trip || trip.trip_type === "ryder_cup";

  if (isRyder) return <RyderCupFormat />;

  // Casual trip: explain the formats actually scheduled (fall back to the
  // whole menu when no rounds exist yet).
  const supabase = await createClient();
  const { data: roundsRaw } = await supabase
    .from("rounds")
    .select("*")
    .eq("trip_id", trip.id)
    .order("day_number");
  const rounds = (roundsRaw ?? []) as Round[];
  const scheduled = [...new Set(rounds.map((r) => r.format))] as RoundFormat[];
  const formats = scheduled.length > 0 ? scheduled : CASUAL_FORMATS;

  return (
    <div className="space-y-5">
      <BackLink />
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">The format</p>
        <h1 className="font-serif text-3xl font-semibold">How this trip works</h1>
        <p className="text-sm text-muted-foreground">
          No teams, no cup — each day has its own game. Here's what's on the card.
        </p>
      </header>

      <section className="space-y-3">
        {formats.map((key) => {
          const f = FORMAT_META[key];
          const days = rounds.filter((r) => r.format === key).map((r) => r.day_number);
          return (
            <article key={key} className="card space-y-3">
              <header className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h3 className="font-serif text-xl font-semibold">
                    {f.label}
                    {days.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        Day {days.join(" & ")}
                      </span>
                    )}
                  </h3>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {f.size}
                </span>
              </header>
              <Row label="Who enters?" body={f.entryRule} />
              <Row label="Scoring" body={f.scoringRule} />
            </article>
          );
        })}
      </section>

      <HandicapCard />
    </div>
  );
}

function RyderCupFormat() {
  return (
    <div className="space-y-5">
      <BackLink />

      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          The format
        </p>
        <h1 className="font-serif text-3xl font-semibold">How the Cup works</h1>
        <p className="text-sm text-muted-foreground">
          Two teams. Three days. Twelve points. {CUP_RULES.pointsToWin} wins it.
        </p>
      </header>

      {/* Cup math --------------------------------------------------------- */}
      <section className="card flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--gold))]/15 text-[hsl(var(--ink))]">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-medium">Ryder Cup points</h2>
          <p className="text-sm text-muted-foreground">
            {CUP_RULES.breakdown} ={" "}
            <span className="text-foreground font-medium">
              {CUP_RULES.totalMatches} matches
            </span>{" "}
            worth 1 point each. Win = 1, halve = 0.5 each, loss = 0. First team
            to {CUP_RULES.pointsToWin} wins the cup. {CUP_RULES.tieDefault}
          </p>
        </div>
      </section>

      {/* Per-day cards --------------------------------------------------- */}
      <section className="space-y-3">
        {FORMATS.map((f) => {
          const Icon = ICON[f.key];
          return (
            <article key={f.key} className="card space-y-3">
              <header className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="font-serif text-xl font-semibold">{f.title}</h3>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {f.size}
                </span>
              </header>

              <Row label="Who enters?" body={f.entryRule} />
              <Row label="Hole scoring" body={f.scoringRule} />
              <Row label="Match" body={f.matchRule} />
            </article>
          );
        })}
      </section>

      <HandicapCard />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/leaderboard"
      className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Leaderboard
    </Link>
  );
}

function HandicapCard() {
  return (
    <section className="card flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Flag className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h2 className="font-medium">Handicaps</h2>
        <p className="text-sm text-muted-foreground">{HANDICAP_BLURB}</p>
      </div>
    </section>
  );
}

function Row({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm">{body}</p>
    </div>
  );
}
