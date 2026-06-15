// Shared activity-feed builder. Used by /feed (full list) and the home
// dashboard (top few items) so the derivation lives in exactly one place.
//
// The feed is the trip's running commentary: birdies/eagles/aces, snowman &
// blow-up roasts, deuces, finished rounds, photos, match results & dormie
// calls, Cup milestones, side-bet action, and new arrivals. Match *status*
// (who's up) lives on the leaderboard; the feed only announces notable events.

import {
  AlertTriangle,
  Bird,
  Camera,
  CheckCircle2,
  DollarSign,
  Egg,
  Flag,
  Snowflake,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, Hole, Match, Player, Round, Score, Team, Trip } from "@/lib/db";
import {
  bestBallBonusPerHole,
  computeCupStandings,
  computeLowNetRows,
  matchResult,
  runMatchPlay,
  scrambleMatchPerHole,
  singlesPerHoleNet,
  type Course as ScCourse,
  type HoleScore,
} from "@/lib/scoring";

export const FEED_ICON: Record<string, typeof Sparkles> = {
  birdie: Bird,
  eagle: Egg,
  albatross: Sparkles,
  hole_in_one: Flag,
  snowman: Snowflake,
  blow_up: AlertTriangle,
  deuce: Target,
  round_done: CheckCircle2,
  photo: Camera,
  match_result: Trophy,
  dormie: TrendingUp,
  cup: Trophy,
  low_net: TrendingUp,
  player_joined: Users,
  match_bet_placed: DollarSign,
  match_bet_taken: DollarSign,
  bet_created: DollarSign,
  bet_settled: DollarSign,
  default: Sparkles,
};

export const FEED_COLOR: Record<string, string> = {
  birdie: "text-[hsl(var(--score-under))]",
  eagle: "text-[hsl(var(--score-under))]",
  albatross: "text-[hsl(var(--gold))]",
  hole_in_one: "text-[hsl(var(--gold))]",
  snowman: "text-[hsl(var(--gold))]",
  blow_up: "text-destructive",
  deuce: "text-primary",
  round_done: "text-foreground",
  photo: "text-primary",
  match_result: "text-primary",
  dormie: "text-primary",
  cup: "text-[hsl(var(--gold))]",
  low_net: "text-foreground",
  player_joined: "text-primary",
  match_bet_placed: "text-muted-foreground",
  match_bet_taken: "text-foreground",
  bet_created: "text-muted-foreground",
  bet_settled: "text-foreground",
};

export type FeedItem = {
  id: string;
  created_at: string;
  type: string;
  text: string;
  hint?: string;
};

export async function buildFeedItems(
  supabase: SupabaseClient,
  tripId: string,
  limit = 60
): Promise<FeedItem[]> {
  const [{ data: tripRow }, { data: roundsRaw }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).maybeSingle(),
    supabase.from("rounds").select("*").eq("trip_id", tripId),
  ]);
  const trip = tripRow as Trip | null;
  const rounds = (roundsRaw ?? []) as Round[];
  const roundIds = rounds.map((r) => r.id);

  const [
    { data: eventsRaw },
    { data: playersRaw },
    { data: matchesRaw },
    { data: scoresRaw },
    { data: teamsRaw },
    { data: photosRaw },
  ] = await Promise.all([
    supabase
      .from("activity_events")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("players").select("*").eq("trip_id", tripId),
    roundIds.length > 0
      ? supabase.from("matches").select("*").in("round_id", roundIds)
      : Promise.resolve({ data: [] as Match[] }),
    roundIds.length > 0
      ? supabase.from("scores").select("*").in("round_id", roundIds).order("updated_at", { ascending: false }).limit(400)
      : Promise.resolve({ data: [] as Score[] }),
    supabase.from("teams").select("*").eq("trip_id", tripId),
    supabase
      .from("photos")
      .select("id, uploaded_by, caption, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const storedEvents = (eventsRaw ?? []) as ActivityEvent[];
  const players = (playersRaw ?? []) as Player[];
  const matches = (matchesRaw ?? []) as Match[];
  const scores = (scoresRaw ?? []) as Score[];
  const teams = (teamsRaw ?? []) as Team[];
  const photos = (photosRaw ?? []) as { id: string; uploaded_by: string | null; caption: string | null; created_at: string }[];

  const playerById = new Map(players.map((p) => [p.id, p]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const nameByUser = new Map(players.filter((p) => p.user_id).map((p) => [p.user_id as string, p.name]));

  // Holes per course (trips can play a different course each day).
  const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[];
  let allHoles: Hole[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase.from("holes").select("*").in("course_id", courseIds);
    allHoles = (data ?? []) as Hole[];
  }
  const holesByCourse = new Map<string, Hole[]>();
  for (const h of allHoles) (holesByCourse.get(h.course_id) ?? holesByCourse.set(h.course_id, []).get(h.course_id)!).push(h);
  const parByCourseHole = new Map<string, number>();
  for (const h of allHoles) parByCourseHole.set(`${h.course_id}|${h.hole_number}`, h.par);
  const courseFor = (r: Round | undefined): ScCourse => ({
    holes: r?.course_id ? holesByCourse.get(r.course_id) ?? [] : [],
  });

  const derived: FeedItem[] = [];

  // --- Per-hole scoring events (need player + par) ------------------------
  const finishedCount = new Map<string, { count: number; last: string }>(); // `${player}|${round}`
  for (const s of scores) {
    if (!s.player_id) continue;
    const round = roundById.get(s.round_id);
    const courseId = round?.course_id;
    const par = courseId ? parByCourseHole.get(`${courseId}|${s.hole_number}`) : undefined;
    const who = playerById.get(s.player_id)?.name ?? "?";
    const hint = round ? `Day ${round.day_number}` : undefined;

    // Track round completion.
    const fk = `${s.player_id}|${s.round_id}`;
    const f = finishedCount.get(fk) ?? { count: 0, last: s.updated_at };
    f.count += 1;
    if (s.updated_at > f.last) f.last = s.updated_at;
    finishedCount.set(fk, f);

    // Snowman: any gross 8, regardless of par.
    if (s.gross === 8) {
      derived.push({
        id: `snow-${s.id}`,
        created_at: s.updated_at,
        type: "snowman",
        text: `☃️ SNOWMAN ALERT — ${who} carded an 8 on ${s.hole_number}`,
        hint,
      });
      continue;
    }
    if (par == null) continue;
    const rel = s.gross - par;
    if (s.gross === 1) {
      derived.push({ id: `s-${s.id}`, created_at: s.updated_at, type: "hole_in_one", text: `${who} ACED hole ${s.hole_number}! 🏆`, hint });
    } else if (rel <= -3) {
      derived.push({ id: `s-${s.id}`, created_at: s.updated_at, type: "albatross", text: `${who} made ALBATROSS on ${s.hole_number}`, hint });
    } else if (rel === -2) {
      derived.push({ id: `s-${s.id}`, created_at: s.updated_at, type: "eagle", text: `${who} eagled ${s.hole_number} 🦅`, hint });
    } else if (rel === -1) {
      derived.push({ id: `s-${s.id}`, created_at: s.updated_at, type: "birdie", text: `${who} birdied ${s.hole_number}`, hint });
    } else if (rel >= 3) {
      derived.push({ id: `s-${s.id}`, created_at: s.updated_at, type: "blow_up", text: `${who} blew up on ${s.hole_number} (+${rel})`, hint });
    }
    // Deuce: any gross 2 (separate callout for the pot).
    if (s.gross === 2) {
      derived.push({ id: `deuce-${s.id}`, created_at: s.updated_at, type: "deuce", text: `${who} made a deuce on ${s.hole_number} 🎯`, hint });
    }
  }

  // --- Round milestones: player posted all 18 -----------------------------
  for (const [key, f] of finishedCount) {
    if (f.count < 18) continue;
    const [playerId, roundId] = key.split("|");
    const round = roundById.get(roundId);
    const who = playerById.get(playerId)?.name ?? "?";
    derived.push({
      id: `done-${key}`,
      created_at: f.last,
      type: "round_done",
      text: `${who} finished the round`,
      hint: round ? `Day ${round.day_number}` : undefined,
    });
  }

  // --- Photos -------------------------------------------------------------
  for (const ph of photos) {
    const who = ph.uploaded_by ? nameByUser.get(ph.uploaded_by) ?? "Someone" : "Someone";
    derived.push({
      id: `photo-${ph.id}`,
      created_at: ph.created_at,
      type: "photo",
      text: `${who} posted a photo${ph.caption ? `: "${ph.caption}"` : ""}`,
    });
  }

  // --- Match results, dormie, and Cup milestones --------------------------
  const matchPoints: { team_a_points: number; team_b_points: number }[] = [];
  for (const m of matches) {
    const round = roundById.get(m.round_id);
    if (!round) continue;
    const state = matchPlayState(m, round, scores, courseFor(round), playerById);
    if (!state) continue;
    matchPoints.push({ team_a_points: state.points.a, team_b_points: state.points.b });

    const aName = teamById.get(m.team_a_id ?? "")?.name ?? (m.side_a.map((id) => playerById.get(id)?.name).filter(Boolean).join(" & ") || "Side A");
    const bName = teamById.get(m.team_b_id ?? "")?.name ?? (m.side_b.map((id) => playerById.get(id)?.name).filter(Boolean).join(" & ") || "Side B");
    const last = matchLastTime(m, scores) ?? round.date ?? new Date(0).toISOString();
    const hint = `Day ${round.day_number} · Match ${m.match_number}`;

    if (state.decided) {
      const w = state.decided.winner;
      const text =
        w === "halve"
          ? `Match ${m.match_number} halved — ${aName} ½, ${bName} ½`
          : `${w === "A" ? aName : bName} win${state.decided.margin ? ` ${state.decided.margin.toGo === 0 ? `${state.decided.margin.up} UP` : `${state.decided.margin.up} & ${state.decided.margin.toGo}`}` : ""}`;
      derived.push({ id: `mres-${m.id}`, created_at: last, type: "match_result", text, hint });
    } else if (
      state.up !== 0 &&
      Math.abs(state.up) === state.holesRemaining &&
      state.holesRemaining > 0 &&
      state.thru > 0
    ) {
      const leader = state.up > 0 ? aName : bName;
      derived.push({ id: `dorm-${m.id}`, created_at: last, type: "dormie", text: `${leader} are dormie ${Math.abs(state.up)}`, hint });
    }
  }

  // Cup clinch / win / tie (Ryder Cup trips only). Only emitted once the Cup is
  // mathematically decided — lead changes would need event history.
  if (trip?.trip_type === "ryder_cup" && matchPoints.length > 0) {
    const cup = computeCupStandings(matchPoints, {
      pointsToWin: Number(trip.points_to_win),
      totalPoints: trip.total_points,
      tieOutcomeLabel: trip.tie_outcome_label,
    });
    if (cup.status === "decided" || cup.status === "tie") {
      const a = teams[0]?.name ?? "Team A";
      const b = teams[1]?.name ?? "Team B";
      const text =
        cup.status === "tie"
          ? `The Cup is tied ${cup.scoreline}`
          : `${cup.winner === "A" ? a : b} win the Cup ${cup.scoreline}`;
      const last = scores[0]?.updated_at ?? new Date().toISOString();
      derived.push({ id: "cup-final", created_at: last, type: "cup", text, hint: "Final" });
    }
  }

  // --- Low-net pot leader (per round with entries) ------------------------
  if (roundIds.length > 0) {
    const { data: entriesRaw } = await supabase
      .from("round_pot_entries")
      .select("round_id, pot_type, player_id")
      .in("round_id", roundIds)
      .eq("pot_type", "low_net");
    const entries = (entriesRaw ?? []) as { round_id: string; player_id: string }[];
    const byRound = new Map<string, string[]>();
    for (const e of entries) (byRound.get(e.round_id) ?? byRound.set(e.round_id, []).get(e.round_id)!).push(e.player_id);
    for (const [roundId, ids] of byRound) {
      const round = roundById.get(roundId);
      if (!round) continue;
      const sbp: Record<string, HoleScore[]> = {};
      let last = "";
      for (const s of scores.filter((s) => s.round_id === roundId && s.player_id && ids.includes(s.player_id))) {
        (sbp[s.player_id!] ??= []).push({ hole_number: s.hole_number, gross: s.gross });
        if (s.updated_at > last) last = s.updated_at;
      }
      const entrants = ids
        .map((id) => playerById.get(id))
        .filter((p): p is Player => !!p)
        .map((p) => ({ id: p.id, name: p.name, index: Number(p.handicap_index) }));
      const rows = computeLowNetRows(entrants, sbp, courseFor(round)).filter((r) => r.thru > 0);
      if (rows.length === 0 || !last) continue;
      derived.push({
        id: `lownet-${roundId}`,
        created_at: last,
        type: "low_net",
        text: `${rows[0].name} leads the low-net pot (${rows[0].net} thru ${rows[0].thru})`,
        hint: `Day ${round.day_number}`,
      });
    }
  }

  // --- Stored events: bets + joins ---------------------------------------
  for (const e of storedEvents) {
    const round = e.round_id ? roundById.get(e.round_id) : undefined;
    const hint = round ? `Day ${round.day_number}` : undefined;
    let text = "";
    if (e.type === "match_bet_placed") {
      const amount = (e.payload as { amount?: number })?.amount;
      const side = (e.payload as { side?: string })?.side;
      text = `New match bet${amount ? ` for $${amount}` : ""}${side ? ` on Side ${side}` : ""}`;
    } else if (e.type === "match_bet_taken") {
      text = "A match bet was taken — game on";
    } else if (e.type === "player_joined") {
      const name = (e.payload as { name?: string })?.name;
      text = `${name ?? "A new player"} joined the trip 👋`;
    } else if (e.type === "bet_created") {
      const amount = (e.payload as { amount?: number })?.amount;
      text = `New bet${amount ? ` for $${amount}` : ""}`;
    } else if (e.type === "bet_settled") {
      text = "Bet settled";
    } else {
      continue; // ignore legacy match_lead / match_decided etc.
    }
    derived.push({ id: `e-${e.id}`, created_at: e.created_at, type: e.type, text, hint });
  }

  const seen = new Set<string>();
  return derived
    .filter((d) => (seen.has(d.id) ? false : seen.add(d.id) && true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------

type MatchState = {
  up: number;
  thru: number;
  holesRemaining: number;
  decided: { winner: "A" | "B" | "halve"; margin?: { up: number; toGo: number } } | null;
  points: { a: number; b: number };
};

function matchPlayState(
  m: Match,
  round: Round,
  scores: Score[],
  course: ScCourse,
  playerById: Map<string, Player>
): MatchState | null {
  const ms = scores.filter((s) => s.match_id === m.id);
  if (ms.length === 0) return null;
  let aPerHole: Map<number, number> | undefined;
  let bPerHole: Map<number, number> | undefined;

  if (round.format === "scramble") {
    const aScores: HoleScore[] = ms.filter((s) => s.team_side === "A").map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const bScores: HoleScore[] = ms.filter((s) => s.team_side === "B").map((s) => ({ hole_number: s.hole_number, gross: s.gross }));
    const out = scrambleMatchPerHole(
      { pair: makePair(m.side_a, playerById), scores: aScores },
      { pair: makePair(m.side_b, playerById), scores: bScores },
      course
    );
    aPerHole = out.aPerHole;
    bPerHole = out.bPerHole;
  } else if (round.format === "best_ball_bonus") {
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

  const prog = runMatchPlay(aPerHole, bPerHole);
  const res = matchResult(prog);
  return {
    up: prog.upDown,
    thru: prog.thru,
    holesRemaining: prog.holesRemaining,
    decided: prog.decided,
    points: res.points,
  };
}

function matchLastTime(m: Match, scores: Score[]): string | null {
  let last: string | null = null;
  for (const s of scores) {
    if (s.match_id !== m.id) continue;
    if (last == null || s.updated_at > last) last = s.updated_at;
  }
  return last;
}

function makePair(ids: string[], by: Map<string, Player>) {
  const a = by.get(ids[0]);
  const b = by.get(ids[1] ?? ids[0]);
  return {
    a: { player_id: a?.id ?? ids[0], index: Number(a?.handicap_index ?? 0) },
    b: { player_id: b?.id ?? (ids[1] ?? ids[0]), index: Number(b?.handicap_index ?? 0) },
  };
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}
