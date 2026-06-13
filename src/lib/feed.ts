// Shared activity-feed builder. Used by /feed (full list) and the home
// dashboard (top few items) so the derivation lives in exactly one place.

import { Bird, DollarSign, Egg, Flag, Sparkles, Target, TrendingUp } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, Match, Player, Round, Score, Team } from "@/lib/db";

export const FEED_ICON: Record<string, typeof Sparkles> = {
  birdie: Bird,
  eagle: Egg,
  hole_in_one: Flag,
  match_lead: TrendingUp,
  match_decided: Flag,
  bet_created: DollarSign,
  bet_settled: DollarSign,
  match_bet_placed: DollarSign,
  match_bet_taken: DollarSign,
  longest_drive: Target,
  closest_to_pin: Target,
  default: Sparkles,
};

export const FEED_COLOR: Record<string, string> = {
  birdie: "text-[hsl(var(--score-under))]",
  eagle: "text-[hsl(var(--score-under))]",
  hole_in_one: "text-[hsl(var(--gold))]",
  match_lead: "text-primary",
  match_decided: "text-primary",
  bet_created: "text-muted-foreground",
  bet_settled: "text-foreground",
  match_bet_placed: "text-muted-foreground",
  match_bet_taken: "text-foreground",
  longest_drive: "text-foreground",
  closest_to_pin: "text-foreground",
};

export type FeedItem = {
  id: string;
  created_at: string;
  type: string;
  text: string;
  hint?: string;
};

/**
 * Build the activity feed for a trip: derived birdies/eagles/HiO from scores,
 * stored activity_events rendered to text, and a coarse in-progress signal per
 * live match. Newest first, deduped.
 */
export async function buildFeedItems(
  supabase: SupabaseClient,
  tripId: string,
  limit = 60
): Promise<FeedItem[]> {
  const { data: roundsRaw } = await supabase
    .from("rounds")
    .select("*")
    .eq("trip_id", tripId);
  const rounds = (roundsRaw ?? []) as Round[];
  const roundIds = rounds.map((r) => r.id);

  const [
    { data: eventsRaw },
    { data: playersRaw },
    { data: matchesRaw },
    { data: scoresRaw },
    { data: teamsRaw },
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
      ? supabase
          .from("scores")
          .select("*")
          .in("round_id", roundIds)
          .order("updated_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as Score[] }),
    supabase.from("teams").select("*").eq("trip_id", tripId),
  ]);

  const storedEvents = (eventsRaw ?? []) as ActivityEvent[];
  const players = (playersRaw ?? []) as Player[];
  const matches = (matchesRaw ?? []) as Match[];
  const scores = (scoresRaw ?? []) as Score[];
  const teams = (teamsRaw ?? []) as Team[];

  const playerById = new Map(players.map((p) => [p.id, p]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));

  const courseId = rounds[0]?.course_id;
  const { data: holesRaw } = courseId
    ? await supabase.from("holes").select("hole_number, par").eq("course_id", courseId)
    : { data: [] as { hole_number: number; par: number }[] };
  const parByHole = new Map((holesRaw ?? []).map((h) => [h.hole_number as number, h.par as number]));

  const derived: FeedItem[] = [];

  // Birdies / eagles / HiO from scores.
  for (const s of scores) {
    if (!s.player_id) continue;
    const par = parByHole.get(s.hole_number);
    if (!par) continue;
    const diff = s.gross - par;
    if (diff <= -1) {
      const p = playerById.get(s.player_id);
      const round = roundById.get(s.round_id);
      const label = diff === -1 ? "birdie" : diff === -2 ? "eagle" : "hole_in_one";
      const labelText = diff === -1 ? "birdie" : diff === -2 ? "eagle" : "ALBATROSS";
      derived.push({
        id: `s-${s.id}`,
        created_at: s.updated_at,
        type: label,
        text: `${p?.name ?? "?"} made ${labelText} on ${s.hole_number}`,
        hint: round ? `Day ${round.day_number}` : undefined,
      });
    }
  }

  // Stored events → text.
  for (const e of storedEvents) {
    const round = e.round_id ? roundById.get(e.round_id) : undefined;
    const hint = round ? `Day ${round.day_number}` : undefined;
    let text = "";
    if (e.type === "match_bet_placed") {
      const amount = (e.payload as { amount?: number })?.amount;
      const side = (e.payload as { side?: string })?.side;
      text = `New match bet${amount ? ` for $${amount}` : ""}${side ? ` on Side ${side}` : ""}`;
    } else if (e.type === "match_bet_taken") {
      text = "Match bet was taken — let's run it";
    } else if (e.type === "bet_created") {
      const desc = (e.payload as { description?: string })?.description;
      const amount = (e.payload as { amount?: number })?.amount;
      text = `New bet${amount ? ` for $${amount}` : ""}${desc ? `: ${desc}` : ""}`;
    } else if (e.type === "bet_settled") {
      text = "Bet settled";
    } else if (e.type === "match_decided") {
      const m = (e.payload as { scoreline?: string; match_number?: number })?.scoreline;
      const num = (e.payload as { scoreline?: string; match_number?: number })?.match_number;
      text = `Match ${num ?? ""} decided${m ? `: ${m}` : ""}`.trim();
    } else if (e.type === "match_lead") {
      const team = (e.payload as { team_name?: string })?.team_name;
      const lead = (e.payload as { lead?: number })?.lead;
      text = `${team ?? "Team"} goes ${lead ?? 1} UP`;
    } else {
      text = e.type.replace(/_/g, " ");
    }
    derived.push({ id: `e-${e.id}`, created_at: e.created_at, type: e.type, text, hint });
  }

  // Coarse in-progress signal per live match.
  for (const m of matches) {
    if (m.status === "complete") continue;
    const mScores = scores.filter((s) => s.match_id === m.id);
    if (mScores.length === 0) continue;
    const teamA = teams.find((t) => t.id === m.team_a_id);
    const teamB = teams.find((t) => t.id === m.team_b_id);
    derived.push({
      id: `m-${m.id}`,
      created_at: mScores[0].updated_at,
      type: "match_progress",
      text: `${teamA?.name ?? "Side A"} vs ${teamB?.name ?? "Side B"} in progress`,
      hint: `Match ${m.match_number}`,
    });
  }

  const seen = new Set<string>();
  return derived
    .filter((d) => (seen.has(d.id) ? false : seen.add(d.id) && true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
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
