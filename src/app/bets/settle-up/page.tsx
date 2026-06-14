import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type {
  Hole,
  Match,
  MatchBet,
  Player,
  PotType,
  Round,
  RoundPotEntry,
  Score,
} from "@/lib/db";
import {
  bestBallBonusPerHole,
  computeDeucesPot,
  computeLowNetPot,
  computeSkinsPot,
  matchResult,
  runMatchPlay,
  scrambleMatchPerHole,
  singlesPerHoleNet,
  type Course as ScCourse,
  type HoleScore,
} from "@/lib/scoring";
import { rollupBalances, simplifyDebts, venmoPayUrl } from "@/lib/venmo";

const BUY_IN = 10;

export default async function SettleUpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bets/settle-up");

  const trip = await getActiveTrip();
  if (!trip) redirect("/bets");

  const [
    { data: roundsRaw },
    { data: playersRaw },
    { data: matchesRaw },
    { data: betsRaw },
  ] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id),
    supabase
      .from("matches")
      .select("*, rounds!inner(trip_id)")
      .eq("rounds.trip_id", trip.id),
    supabase.from("match_bets").select("*").eq("trip_id", trip.id),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const matches = (matchesRaw ?? []) as Match[];
  const bets = (betsRaw ?? []) as MatchBet[];

  let entries: RoundPotEntry[] = [];
  let scores: Score[] = [];
  let allHoles: Hole[] = [];
  if (rounds.length > 0) {
    const ids = rounds.map((r) => r.id);
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from("round_pot_entries").select("*").in("round_id", ids),
      supabase.from("scores").select("*").in("round_id", ids),
    ]);
    entries = (e ?? []) as RoundPotEntry[];
    scores = (s ?? []) as Score[];
    const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[];
    if (courseIds.length > 0) {
      const { data } = await supabase
        .from("holes")
        .select("*")
        .in("course_id", courseIds)
        .order("hole_number");
      allHoles = (data ?? []) as Hole[];
    }
  }
  const holesByCourse = new Map<string, Hole[]>();
  for (const h of allHoles) {
    (holesByCourse.get(h.course_id) ?? holesByCourse.set(h.course_id, []).get(h.course_id)!).push(h);
  }
  const courseFor = (r: Round | undefined): ScCourse => ({
    holes: r?.course_id ? holesByCourse.get(r.course_id) ?? [] : [],
  });
  const playerById = new Map(players.map((p) => [p.id, p]));
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));

  // ------------------------------------------------------------------
  // Match-bet edges: winner gets `amount` from loser.
  // ------------------------------------------------------------------
  const edges: { from: string; to: string; amount: number }[] = [];
  for (const b of bets) {
    if (!b.taker_player_id) continue; // never taken
    const match = matchById.get(b.match_id);
    if (!match) continue;
    const winSide = pickSideForMatch(match, scores, playerById, courseFor, roundById);
    if (!winSide) continue;
    if (winSide === "halve") continue; // push, no money moves
    if (winSide === b.side) {
      // placer wins
      edges.push({ from: b.taker_player_id, to: b.placer_player_id, amount: Number(b.amount) });
    } else {
      edges.push({ from: b.placer_player_id, to: b.taker_player_id, amount: Number(b.amount) });
    }
  }

  // ------------------------------------------------------------------
  // Pot edges: entrants pay $BUY_IN into the pot; winners receive their
  // share. Net = (received − contributed). Encode as edges from each
  // contributing loser to each winner, weighted by share. To keep it
  // simple we model the pot as: every entrant contributes BUY_IN to a
  // virtual pool, then the pool pays winners — equivalent net-effect is
  // a set of pairwise transfers we hand to the simplifier.
  // ------------------------------------------------------------------
  const POT_TYPES: PotType[] = ["skins", "deuces", "low_net"];
  const orderedRounds = [...rounds].sort((a, b) => a.day_number - b.day_number);
  for (const pot of POT_TYPES) {
    let carry = 0;
    for (const r of orderedRounds) {
      const ents = entries.filter((e) => e.round_id === r.id && e.pot_type === pot);
      const potPlayers = ents
        .map((e) => playerById.get(e.player_id))
        .filter((p): p is Player => !!p)
        .map((p) => ({ id: p.id, name: p.name, index: Number(p.handicap_index) }));
      const sbp: Record<string, HoleScore[]> = {};
      for (const s of scores.filter((s) => s.round_id === r.id)) {
        if (!s.player_id) continue;
        (sbp[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
      }
      const roundCourse = courseFor(r);
      const payout =
        pot === "skins"
          ? computeSkinsPot(potPlayers, sbp, roundCourse, BUY_IN, carry)
          : pot === "deuces"
            ? computeDeucesPot(potPlayers, sbp, BUY_IN, carry, roundCourse)
            : computeLowNetPot(potPlayers, sbp, roundCourse, BUY_IN, carry);

      if (!payout.settled) {
        carry = 0;
        continue;
      }

      if (payout.winners.length === 0) {
        // Whole pot carries; nobody actually pays yet.
        carry = payout.carryOut;
        continue;
      }

      // Effective transfers: each entrant has already "paid" BUY_IN; each
      // winner gets their share. Encode as direct edges that net out
      // correctly once simplifyDebts collapses them.
      const winnerSet = new Map<string, number>();
      for (const w of payout.winners) winnerSet.set(w.player_id, w.amount);

      // Take buy_in × N_entrants + carry as the bucket, and synthesize an
      // imaginary "house" debt/credit. The simplest formulation that nets
      // correctly: every entrant pays BUY_IN into a virtual pot; the pot
      // then pays each winner their share. We can collapse that to edges
      // ENTRANT → WINNER weighted by winner_share / total_pot * BUY_IN
      // for each entrant-winner pair, PLUS an extra edge representing the
      // carry (which originated from prior round entrants — we'll attribute
      // it proportionally too, since they're the same player roster across
      // a trip's pots more often than not).
      const totalEntrantContribution = potPlayers.length * BUY_IN;
      const pot_total = totalEntrantContribution + payout.carryIn;
      for (const entrant of potPlayers) {
        for (const w of payout.winners) {
          if (entrant.id === w.player_id) continue;
          // Entrant's "share" of the prize each winner is receiving:
          //   contribution_ratio = BUY_IN / pot_total
          // We charge entrant the winner's amount × contribution_ratio.
          const fromContribution = (w.amount * BUY_IN) / pot_total;
          if (fromContribution > 0) {
            edges.push({ from: entrant.id, to: w.player_id, amount: fromContribution });
          }
        }
      }

      carry = 0;
    }
  }

  const balances = rollupBalances(edges);
  const simplified = simplifyDebts(balances);

  return (
    <div className="space-y-5">
      <Link
        href="/bets"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Bets
      </Link>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold">Settle up</h1>
          <p className="text-sm text-muted-foreground">
            Fewest possible Venmo transactions to clear every settled match bet and round pot.
          </p>
        </div>
      </header>

      <section className="card">
        <h2 className="font-medium">Running tally</h2>
        {balances.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No settled action yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {balances
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .map((b) => {
                const name = playerById.get(b.player_id)?.name ?? "?";
                const positive = b.amount > 0;
                return (
                  <li key={b.player_id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{name}</span>
                    <span
                      className={`font-medium tabular-nums ${
                        positive
                          ? "text-[hsl(var(--score-under))]"
                          : b.amount < 0
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {positive ? `+ $${b.amount.toFixed(2)}` : `- $${Math.abs(b.amount).toFixed(2)}`}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {simplified.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-medium">Simplified plan ({simplified.length} payments)</h2>
          <p className="text-xs text-muted-foreground">
            Tap "Pay" to open Venmo. Amount is best-effort prefilled.
          </p>
          <ul className="space-y-2">
            {simplified.map((t, i) => {
              const from = playerById.get(t.player_id_from);
              const to = playerById.get(t.player_id_to);
              const venmo = to?.venmo_username;
              const note = `Trip settle-up · ${trip.name}`;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background/40 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm">
                      <strong>{from?.name ?? "?"}</strong>
                      <span className="text-muted-foreground"> pays </span>
                      <strong>{to?.name ?? "?"}</strong>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${t.amount.toFixed(2)}
                      {venmo ? ` · @${venmo.replace(/^@+/, "")}` : " · no Venmo linked"}
                    </div>
                  </div>
                  {venmo ? (
                    <a
                      href={venmoPayUrl({ username: venmo, amount: t.amount, note })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn inline-flex items-center gap-1.5 text-xs"
                    >
                      Pay <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-destructive">Add Venmo</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function makePair(ids: string[], by: Map<string, Player>) {
  const a = by.get(ids[0]);
  const b = by.get(ids[1] ?? ids[0]);
  return {
    a: { player_id: a?.id ?? ids[0], index: Number(a?.handicap_index ?? 0) },
    b: { player_id: b?.id ?? (ids[1] ?? ids[0]), index: Number(b?.handicap_index ?? 0) },
  };
}

function pickSideForMatch(
  m: Match,
  scores: Score[],
  playerById: Map<string, Player>,
  courseFor: (r: Round | undefined) => ScCourse,
  roundById: Map<string, Round>
): "A" | "B" | "halve" | null {
  const r = roundById.get(m.round_id);
  if (!r) return null;
  const course = courseFor(r);
  const ms = scores.filter((s) => s.match_id === m.id);
  let aPerHole: Map<number, number> | undefined;
  let bPerHole: Map<number, number> | undefined;

  if (r.format === "scramble") {
    const aScores: HoleScore[] = ms
      .filter((s) => s.team_side === "A")
      .map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const bScores: HoleScore[] = ms
      .filter((s) => s.team_side === "B")
      .map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const sideA = { pair: makePair(m.side_a, playerById), scores: aScores };
    const sideB = { pair: makePair(m.side_b, playerById), scores: bScores };
    const out = scrambleMatchPerHole(sideA, sideB, course);
    aPerHole = out.aPerHole;
    bPerHole = out.bPerHole;
  } else if (r.format === "best_ball_bonus") {
    const aBy: Record<string, HoleScore[]> = {};
    const bBy: Record<string, HoleScore[]> = {};
    for (const s of ms) {
      if (!s.player_id) continue;
      const target = m.side_a.includes(s.player_id) ? aBy : bBy;
      (target[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
    }
    aPerHole = bestBallBonusPerHole({ pair: makePair(m.side_a, playerById), scoresByPlayer: aBy }, course);
    bPerHole = bestBallBonusPerHole({ pair: makePair(m.side_b, playerById), scoresByPlayer: bBy }, course);
  } else {
    const a = playerById.get(m.side_a[0]);
    const b = playerById.get(m.side_b[0]);
    if (!a || !b) return null;
    const aScores = ms.filter((s) => s.player_id === a.id).map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const bScores = ms.filter((s) => s.player_id === b.id).map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    aPerHole = singlesPerHoleNet(Number(a.handicap_index), aScores, course);
    bPerHole = singlesPerHoleNet(Number(b.handicap_index), bScores, course);
  }
  if (!aPerHole || !bPerHole) return null;
  const prog = runMatchPlay(aPerHole, bPerHole);
  const res = matchResult(prog);
  if (res.status !== "complete") return null;
  if (res.points.a > res.points.b) return "A";
  if (res.points.b > res.points.a) return "B";
  return "halve";
}
