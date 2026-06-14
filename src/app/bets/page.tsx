import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Check,
  Coins,
  Flame,
  Hash,
  Lock,
  Target,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { autoLinkPlayers } from "@/lib/ensure-profile";
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
  type PotPayout,
} from "@/lib/scoring";
import { PlaceBetForm } from "./place-bet-form";
import {
  cancelMatchBetAction,
  takeMatchBetAction,
  togglePotEntryAction,
} from "./actions";

const POT_TYPES: PotType[] = ["skins", "deuces", "low_net"];
const POT_LABEL: Record<PotType, string> = {
  skins: "Skins",
  deuces: "Deuces",
  low_net: "Low net",
};
const POT_BLURB: Record<PotType, string> = {
  skins: "Birdie-or-better, unique on the hole. Eagle beats birdie.",
  deuces: "Any gross 2 anywhere on the course.",
  low_net: "Lowest net for the round. Ties split.",
};
const BUY_IN = 10;

export default async function BetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bets");
  await autoLinkPlayers();

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
        <p className="text-sm text-muted-foreground">
          Join or create a trip to start tracking side action.
        </p>
      </div>
    );
  }

  // The signed-in user's player row on this trip — required for everything on
  // this page. If they're not on the roster we surface an empty state.
  const { data: meRow } = await supabase
    .from("players")
    .select("*")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as Player | null) ?? null;

  const [{ data: roundsRaw }, { data: playersRaw }, { data: matchesRaw }, { data: betsRaw }, { data: entriesRaw }] =
    await Promise.all([
      supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
      supabase.from("players").select("*").eq("trip_id", trip.id),
      supabase
        .from("matches")
        .select("*, rounds!inner(trip_id)")
        .eq("rounds.trip_id", trip.id)
        .order("match_number"),
      supabase
        .from("match_bets")
        .select("*")
        .eq("trip_id", trip.id)
        .order("created_at", { ascending: false }),
      // entries scoped by trip via the round_id IN clause below
      Promise.resolve({ data: null as RoundPotEntry[] | null }),
    ]);

  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const matches = (matchesRaw ?? []) as Match[];
  const bets = (betsRaw ?? []) as MatchBet[];

  let entries: RoundPotEntry[] = [];
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("round_pot_entries")
      .select("*")
      .in("round_id", rounds.map((r) => r.id));
    entries = (data ?? []) as RoundPotEntry[];
  }

  // Course holes per course — a trip can play a different course each day.
  const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[];
  let allHoles: Hole[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase
      .from("holes")
      .select("*")
      .in("course_id", courseIds)
      .order("hole_number");
    allHoles = (data ?? []) as Hole[];
  }
  const holesByCourse = new Map<string, Hole[]>();
  for (const h of allHoles) {
    (holesByCourse.get(h.course_id) ?? holesByCourse.set(h.course_id, []).get(h.course_id)!).push(h);
  }
  const courseFor = (r: Round | undefined): ScCourse => ({
    holes: r?.course_id ? holesByCourse.get(r.course_id) ?? [] : [],
  });

  // Scores fan-in for round status + pot computation.
  let scores: Score[] = [];
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("scores")
      .select("*")
      .in("round_id", rounds.map((r) => r.id));
    scores = (data ?? []) as Score[];
  }

  // Round-started = any score on that round.
  const startedByRound = new Map<string, boolean>();
  for (const r of rounds) startedByRound.set(r.id, false);
  for (const s of scores) startedByRound.set(s.round_id, true);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const matchesByRound = new Map<string, Match[]>();
  for (const r of rounds) matchesByRound.set(r.id, []);
  for (const m of matches) matchesByRound.get(m.round_id)?.push(m);

  // ---------------------------------------------------------------------
  // Match-bet eligibility helpers
  // ---------------------------------------------------------------------

  function sideLabel(m: Match, side: "A" | "B"): string {
    const ids = side === "A" ? m.side_a : m.side_b;
    const names = ids.map((id) => playerById.get(id)?.name ?? "?");
    if (names.length === 0) return "—";
    return names.join(" & ");
  }

  function allowedSides(m: Match): ("A" | "B")[] {
    if (!me) return [];
    const onA = m.side_a.includes(me.id);
    const onB = m.side_b.includes(me.id);
    if (onA) return ["A"]; // can only back your own side
    if (onB) return ["B"];
    return ["A", "B"]; // bystander → either
  }

  // Matches available to place a bet on: any match whose round HASN'T started.
  const openMatchesForBetting = matches.filter(
    (m) => !startedByRound.get(m.round_id)
  );

  const placeBetOptions = openMatchesForBetting
    .map((m) => {
      const r = roundById.get(m.round_id);
      return {
        id: m.id,
        number: m.match_number,
        round_id: m.round_id,
        day_number: r?.day_number ?? 0,
        side_a_label: sideLabel(m, "A"),
        side_b_label: sideLabel(m, "B"),
        allowed: allowedSides(m),
      };
    })
    // Only show matches where I can back at least one side.
    .filter((o) => o.allowed.length > 0);

  // ---------------------------------------------------------------------
  // Match-bet result detection — auto-derives from live scores.
  // ---------------------------------------------------------------------

  function pickSideForMatch(m: Match): "A" | "B" | "halve" | null {
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
      // Singles / match_play / others — net per-hole for each side's single player.
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

  // ---------------------------------------------------------------------
  // Round-pot rendering
  // ---------------------------------------------------------------------

  const myEntriesByRound = new Map<string, Set<PotType>>();
  if (me) {
    for (const r of rounds) myEntriesByRound.set(r.id, new Set());
    for (const e of entries) {
      if (e.player_id !== me.id) continue;
      myEntriesByRound.get(e.round_id)?.add(e.pot_type);
    }
  }

  // Walk rounds in day order, accumulating carry per pot type.
  const carryByRoundPot = new Map<string, number>();
  const payoutByRoundPot = new Map<string, PotPayout>();
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
        // For solo formats scores have match_id null; for match formats each
        // partner has match_id set. Either way, the per-player gross-by-hole
        // map represents that player's strokes.
        (sbp[s.player_id] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
      }

      const roundCourse = courseFor(r);
      let payout: PotPayout;
      if (pot === "skins") payout = computeSkinsPot(potPlayers, sbp, roundCourse, BUY_IN, carry);
      else if (pot === "deuces") payout = computeDeucesPot(potPlayers, sbp, BUY_IN, carry, roundCourse);
      else payout = computeLowNetPot(potPlayers, sbp, roundCourse, BUY_IN, carry);

      const key = `${r.id}|${pot}`;
      carryByRoundPot.set(key, carry);
      payoutByRoundPot.set(key, payout);
      // Once a round is settled, its carryOut feeds the next round.
      carry = payout.carryOut;
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const openBets = bets.filter((b) => !b.taker_player_id && b.outcome == null);
  const liveBets = bets.filter((b) => b.taker_player_id && b.outcome == null);
  const settledBets = bets.filter((b) => b.outcome != null);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Bets</h1>
          <p className="text-sm text-muted-foreground">{trip.name}</p>
        </div>
        <Link
          href="/bets/settle-up"
          className="btn-ghost inline-flex items-center gap-1.5 text-sm"
        >
          <Wallet className="h-4 w-4" />
          Settle up
        </Link>
      </header>

      {/* MATCH BETS ------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-semibold">Match bets</h2>
          <span className="text-[11px] text-muted-foreground">Lock when the round starts</span>
        </div>

        {me ? (
          <PlaceBetForm matches={placeBetOptions} />
        ) : (
          <p className="card text-sm text-muted-foreground">
            You're not on this trip's roster, so you can't place bets. Ask the
            admin to add you.
          </p>
        )}

        <BetGroup title="Open — anyone can take" empty="No open bets yet.">
          {openBets.map((b) => {
            const match = matchById.get(b.match_id);
            const round = match ? roundById.get(match.round_id) : null;
            const locked = round ? startedByRound.get(round.id) : false;
            const placer = playerById.get(b.placer_player_id);
            const placerSide = b.side;
            const takerSide = placerSide === "A" ? "B" : "A";
            const canTake = me && match
              ? me.id !== b.placer_player_id
                && !((placerSide === "A" && match.side_a.includes(me.id))
                  || (placerSide === "B" && match.side_b.includes(me.id)))
                && !locked
              : false;
            const minePlaced = me?.id === b.placer_player_id;
            return (
              <BetCard
                key={b.id}
                label={match ? `Day ${round?.day_number ?? "?"} · Match ${match.match_number}` : "Match"}
                placerName={placer?.name ?? "?"}
                amount={b.amount}
                backed={match ? sideLabel(match, placerSide) : `Side ${placerSide}`}
                opposite={match ? sideLabel(match, takerSide) : `Side ${takerSide}`}
                status={locked ? "locked" : "open"}
              >
                {canTake && (
                  <form action={takeMatchBetAction}>
                    <input type="hidden" name="bet_id" value={b.id} />
                    <button className="btn text-xs">Take the other side</button>
                  </form>
                )}
                {minePlaced && !locked && (
                  <form action={cancelMatchBetAction}>
                    <input type="hidden" name="bet_id" value={b.id} />
                    <button className="btn-ghost inline-flex items-center gap-1 text-xs">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                  </form>
                )}
              </BetCard>
            );
          })}
        </BetGroup>

        <BetGroup title="Live — taken, awaiting result" empty="">
          {liveBets.map((b) => {
            const match = matchById.get(b.match_id);
            const round = match ? roundById.get(match.round_id) : null;
            const placer = playerById.get(b.placer_player_id);
            const taker = b.taker_player_id ? playerById.get(b.taker_player_id) : null;
            const placerSide = b.side;
            const takerSide = placerSide === "A" ? "B" : "A";
            const winSide = match ? pickSideForMatch(match) : null;
            const winnerName =
              winSide == null
                ? null
                : winSide === "halve"
                  ? "Push — stakes return"
                  : winSide === placerSide
                    ? `${placer?.name ?? "?"} wins $${b.amount.toFixed(0)}`
                    : `${taker?.name ?? "?"} wins $${b.amount.toFixed(0)}`;
            return (
              <BetCard
                key={b.id}
                label={match ? `Day ${round?.day_number ?? "?"} · Match ${match.match_number}` : "Match"}
                placerName={placer?.name ?? "?"}
                takerName={taker?.name ?? null}
                amount={b.amount}
                backed={match ? sideLabel(match, placerSide) : `Side ${placerSide}`}
                opposite={match ? sideLabel(match, takerSide) : `Side ${takerSide}`}
                status={winSide ? "done" : "live"}
                winnerNote={winnerName}
              />
            );
          })}
        </BetGroup>

        <BetGroup title="Settled" empty="">
          {settledBets.map((b) => {
            const match = matchById.get(b.match_id);
            const round = match ? roundById.get(match.round_id) : null;
            const placer = playerById.get(b.placer_player_id);
            const taker = b.taker_player_id ? playerById.get(b.taker_player_id) : null;
            const placerSide = b.side;
            const takerSide = placerSide === "A" ? "B" : "A";
            const note =
              b.outcome === "cancelled"
                ? "Cancelled"
                : b.outcome === "halve"
                  ? "Push — stakes returned"
                  : b.outcome === "placer"
                    ? `${placer?.name ?? "?"} won $${b.amount.toFixed(0)}`
                    : `${taker?.name ?? "?"} won $${b.amount.toFixed(0)}`;
            return (
              <BetCard
                key={b.id}
                label={match ? `Day ${round?.day_number ?? "?"} · Match ${match.match_number}` : "Match"}
                placerName={placer?.name ?? "?"}
                takerName={taker?.name ?? null}
                amount={b.amount}
                backed={match ? sideLabel(match, placerSide) : `Side ${placerSide}`}
                opposite={match ? sideLabel(match, takerSide) : `Side ${takerSide}`}
                status="settled"
                winnerNote={note}
              />
            );
          })}
        </BetGroup>
      </section>

      {/* ROUND POTS ------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-semibold">Round pots</h2>
          <span className="text-[11px] text-muted-foreground">${BUY_IN} each, opt in before tee-off</span>
        </div>

        {rounds.length === 0 && (
          <p className="card text-sm text-muted-foreground">No rounds scheduled.</p>
        )}

        {rounds.map((round) => {
          const started = startedByRound.get(round.id) ?? false;
          const mySet = me ? myEntriesByRound.get(round.id) ?? new Set() : new Set();
          return (
            <article key={round.id} className="card space-y-3">
              <header className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-serif text-lg font-semibold">Day {round.day_number}</h3>
                  <p className="text-[11px] text-muted-foreground">{round.format.replace("_", " ")}</p>
                </div>
                {started ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Locked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                    Open
                  </span>
                )}
              </header>

              <div className="grid gap-2 sm:grid-cols-3">
                {POT_TYPES.map((pot) => {
                  const key = `${round.id}|${pot}`;
                  const carry = carryByRoundPot.get(key) ?? 0;
                  const payout = payoutByRoundPot.get(key);
                  const isIn = mySet.has(pot);
                  return (
                    <PotCard
                      key={pot}
                      pot={pot}
                      buyIn={BUY_IN}
                      carryIn={carry}
                      payout={payout}
                      players={players}
                      entries={entries.filter((e) => e.round_id === round.id && e.pot_type === pot)}
                      started={started}
                      me={me}
                      iAmIn={isIn}
                      roundId={round.id}
                    />
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function BetGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const filtered = arr.filter(Boolean);
  if (filtered.length === 0 && empty === "") return null;
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">{filtered}</ul>
      )}
    </div>
  );
}

function BetCard({
  label,
  placerName,
  takerName,
  amount,
  backed,
  opposite,
  status,
  winnerNote,
  children,
}: {
  label: string;
  placerName: string;
  takerName?: string | null;
  amount: number;
  backed: string;
  opposite: string;
  status: "open" | "live" | "settled" | "locked" | "done";
  winnerNote?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="card flex flex-wrap items-start gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm">
          <strong>{placerName}</strong> on <span className="text-primary">{backed}</span>
          <span className="text-muted-foreground"> vs </span>
          <strong>{takerName ?? "open"}</strong> on <span className="text-foreground">{opposite}</span>
        </p>
        {winnerNote && (
          <p className="text-xs text-[hsl(var(--score-under))]">{winnerNote}</p>
        )}
      </div>
      <div className="text-right">
        <p className="font-serif text-xl font-semibold tabular-nums">${amount.toFixed(0)}</p>
        <p className="text-[11px] text-muted-foreground capitalize">{status}</p>
      </div>
      {children && <div className="flex w-full gap-2 sm:w-auto sm:basis-auto">{children}</div>}
    </li>
  );
}

function PotCard({
  pot,
  buyIn,
  carryIn,
  payout,
  players,
  entries,
  started,
  me,
  iAmIn,
  roundId,
}: {
  pot: PotType;
  buyIn: number;
  carryIn: number;
  payout: PotPayout | undefined;
  players: Player[];
  entries: RoundPotEntry[];
  started: boolean;
  me: Player | null;
  iAmIn: boolean;
  roundId: string;
}) {
  const Icon = pot === "skins" ? Flame : pot === "deuces" ? Hash : Target;
  const playerById = new Map(players.map((p) => [p.id, p]));
  const entrants = entries
    .map((e) => playerById.get(e.player_id)?.name ?? "?")
    .sort();
  const total = (payout?.potTotal ?? entries.length * buyIn + carryIn);

  return (
    <div className="rounded-xl border border-line bg-background/40 p-3 space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium">{POT_LABEL[pot]}</span>
        </div>
        <div className="text-right">
          <p className="font-serif text-base font-semibold tabular-nums">${total.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground">
            {entries.length} in{carryIn > 0 ? ` · +$${carryIn.toFixed(0)} carry` : ""}
          </p>
        </div>
      </header>

      <p className="text-[10px] text-muted-foreground">{POT_BLURB[pot]}</p>

      {/* Opt-in toggle, only before round starts and if I'm on the roster. */}
      {!started && me && (
        <form action={togglePotEntryAction}>
          <input type="hidden" name="round_id" value={roundId} />
          <input type="hidden" name="pot_type" value={pot} />
          <button
            type="submit"
            className={
              iAmIn
                ? "btn-ghost inline-flex w-full items-center justify-center gap-1.5 text-xs"
                : "btn inline-flex w-full items-center justify-center gap-1.5 text-xs"
            }
          >
            {iAmIn ? (
              <>
                <Check className="h-3 w-3" />
                You're in — tap to opt out
              </>
            ) : (
              <>
                <Coins className="h-3 w-3" />
                I'm in for ${buyIn}
              </>
            )}
          </button>
        </form>
      )}

      {/* Entrants list (always visible). */}
      {entrants.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          <Users className="mr-1 inline h-2.5 w-2.5" />
          {entrants.join(", ")}
        </p>
      )}

      {/* Results — once any meaningful event has happened. */}
      {payout && (payout.winners.length > 0 || (started && payout.settled)) && (
        <PotResultBlock pot={pot} payout={payout} players={players} />
      )}
    </div>
  );
}

function PotResultBlock({
  pot,
  payout,
  players,
}: {
  pot: PotType;
  payout: PotPayout;
  players: Player[];
}) {
  const playerById = new Map(players.map((p) => [p.id, p]));
  return (
    <div className="rounded-lg bg-card/60 p-2 space-y-1.5">
      {payout.carryOut > 0 ? (
        <p className="text-[11px] text-[hsl(var(--score-under))]">
          No winner — ${payout.carryOut.toFixed(0)} carries to next round.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {payout.winners.map((w) => (
            <li key={w.player_id} className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3 w-3 text-[hsl(var(--gold))]" />
                {playerById.get(w.player_id)?.name ?? "?"}
              </span>
              <span className="font-medium tabular-nums">${w.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
      {pot === "skins" && payout.detail.skins && (
        <p className="text-[10px] text-muted-foreground">
          Holes won:{" "}
          {payout.detail.skins
            .filter((s) => s.state === "won")
            .map((s) => {
              const name = playerById.get(s.winner_player_id ?? "")?.name ?? "?";
              return `${s.hole_number} (${name})`;
            })
            .join(", ") || "—"}
        </p>
      )}
      {pot === "deuces" && payout.detail.deuces && payout.detail.deuces.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {payout.detail.deuces.length} deuce{payout.detail.deuces.length === 1 ? "" : "s"}
        </p>
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

