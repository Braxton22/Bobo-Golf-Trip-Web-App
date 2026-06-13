import { redirect } from "next/navigation";
import { Bird, DollarSign, Egg, Flag, Sparkles, Target, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { ActivityEvent, Match, Player, Round, Score, Team } from "@/lib/db";
import { FeedRefresh } from "./refresh";

const ICON_BY_TYPE: Record<string, typeof Sparkles> = {
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

const COLOR_BY_TYPE: Record<string, string> = {
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

type Derived = {
  id: string;
  created_at: string;
  type: string;
  text: string;
  hint?: string;
};

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
      </div>
    );
  }

  // Load everything we need to derive events, plus stored events from the DB.
  const [
    { data: eventsRaw },
    { data: playersRaw },
    { data: roundsRaw },
    { data: matchesRaw },
    { data: scoresRaw },
    { data: teamsRaw },
  ] = await Promise.all([
    supabase
      .from("activity_events")
      .select("*")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("players").select("*").eq("trip_id", trip.id),
    supabase.from("rounds").select("*").eq("trip_id", trip.id),
    supabase
      .from("matches")
      .select("*")
      .in(
        "round_id",
        (await supabase.from("rounds").select("id").eq("trip_id", trip.id)).data?.map((r) => r.id as string) ?? []
      ),
    supabase
      .from("scores")
      .select("*")
      .in(
        "round_id",
        (await supabase.from("rounds").select("id").eq("trip_id", trip.id)).data?.map((r) => r.id as string) ?? []
      )
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase.from("teams").select("*").eq("trip_id", trip.id),
  ]);

  const storedEvents = (eventsRaw ?? []) as ActivityEvent[];
  const players = (playersRaw ?? []) as Player[];
  const rounds = (roundsRaw ?? []) as Round[];
  const matches = (matchesRaw ?? []) as Match[];
  const scores = (scoresRaw ?? []) as Score[];
  const teams = (teamsRaw ?? []) as Team[];

  const playerById = new Map(players.map((p) => [p.id, p]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));

  // Course holes to know par per hole.
  const courseId = rounds[0]?.course_id;
  const { data: holesRaw } = courseId
    ? await supabase.from("holes").select("hole_number, par").eq("course_id", courseId)
    : { data: [] as { hole_number: number; par: number }[] };
  const parByHole = new Map((holesRaw ?? []).map((h) => [h.hole_number as number, h.par as number]));

  // Derive birdies / eagles / HiO from scores (only when player_id known + par known).
  const derived: Derived[] = [];
  for (const s of scores) {
    if (!s.player_id) continue;
    const par = parByHole.get(s.hole_number);
    if (!par) continue;
    const diff = s.gross - par;
    if (diff <= -1) {
      const p = playerById.get(s.player_id);
      const round = roundById.get(s.round_id);
      const label = diff === -1 ? "birdie" : diff === -2 ? "eagle" : diff <= -3 ? "hole_in_one" : "birdie";
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

  // Stored events → human-readable text.
  for (const e of storedEvents) {
    const round = e.round_id ? roundById.get(e.round_id) : undefined;
    let text = "";
    let hint = round ? `Day ${round.day_number}` : undefined;
    if (e.type === "match_bet_placed") {
      const amount = (e.payload as { amount?: number })?.amount;
      const side = (e.payload as { side?: string })?.side;
      text = `New match bet${amount ? ` for $${amount}` : ""}${side ? ` on Side ${side}` : ""}`;
    } else if (e.type === "match_bet_taken") {
      text = "Match bet was taken — let's run it";
    } else if (e.type === "bet_created") {
      // Legacy event from the old freeform-bet schema. Kept readable for old
      // trips that still have these in their feed.
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

  // Derive in-flight match leads from current match states. We compare each
  // match's UP/DOWN to zero — anything non-zero is a current lead. Lightweight
  // signal so the feed isn't empty before stored events accumulate.
  for (const m of matches) {
    if (m.status === "complete") continue;
    const mScores = scores.filter((s) => s.match_id === m.id);
    if (mScores.length === 0) continue;
    // Coarse: just report "match has scoring activity" once per match.
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

  // Newest first, dedup by id.
  const seen = new Set<string>();
  const items = derived
    .filter((d) => (seen.has(d.id) ? false : seen.add(d.id) && true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 60);

  return (
    <div className="space-y-4">
      <FeedRefresh tripId={trip.id} />
      <header>
        <h1 className="font-serif text-3xl font-semibold">Feed</h1>
        <p className="text-sm text-muted-foreground">{trip.name}</p>
      </header>

      {items.length === 0 ? (
        <p className="card text-sm text-muted-foreground">
          Quiet on the course. Birdies, match leads, and settled bets will land here as they happen.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const Icon = ICON_BY_TYPE[it.type] ?? ICON_BY_TYPE.default;
            const color = COLOR_BY_TYPE[it.type] ?? "text-muted-foreground";
            return (
              <li key={it.id} className="card flex items-center gap-3 py-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-card border border-line ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{it.text}</p>
                  {it.hint && <p className="text-[11px] text-muted-foreground">{it.hint}</p>}
                </div>
                <time className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {relTime(it.created_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function relTime(iso: string): string {
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
