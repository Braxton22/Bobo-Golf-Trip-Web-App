import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import type { Hole, Match, Player, Round, Score, Team } from "@/lib/db";
import { ScoreEntry } from "./score-entry";
import { MatchLiveSync } from "./live-sync";

type PageProps = { params: Promise<{ matchId: string }> };

export default async function MatchScorePage({ params }: PageProps) {
  const { matchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/scorecard/${matchId}`);

  const trip = await getActiveTrip();
  if (!trip) redirect("/scorecard");

  const { data: matchRow } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  const match = matchRow as Match | null;
  if (!match) {
    return (
      <div className="card text-center space-y-2">
        <p className="text-sm text-muted-foreground">Match not found.</p>
        <Link href="/scorecard" className="btn-ghost mt-2 inline-flex">
          Back
        </Link>
      </div>
    );
  }

  const { data: roundRow } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", match.round_id)
    .maybeSingle();
  const round = roundRow as Round;

  const playerIds = [...match.side_a, ...match.side_b];
  const [{ data: playersRaw }, { data: holesRaw }, { data: scoresRaw }, { data: teamsRaw }] = await Promise.all([
    supabase.from("players").select("*").in("id", playerIds),
    round.course_id
      ? supabase.from("holes").select("*").eq("course_id", round.course_id).order("hole_number")
      : Promise.resolve({ data: [] as Hole[] }),
    supabase.from("scores").select("*").eq("match_id", match.id),
    supabase.from("teams").select("*").eq("trip_id", trip.id),
  ]);
  const players = (playersRaw ?? []) as Player[];
  const holes = (holesRaw ?? []) as Hole[];
  const scores = (scoresRaw ?? []) as Score[];
  const teams = (teamsRaw ?? []) as Team[];

  const teamAName = teams.find((t) => t.id === match.team_a_id)?.name ?? "Side A";
  const teamBName = teams.find((t) => t.id === match.team_b_id)?.name ?? "Side B";

  // Is the current user on one of the sides?
  const myPlayer = players.find((p) => p.user_id === user.id);
  const mySide: "A" | "B" | null = !myPlayer
    ? null
    : match.side_a.includes(myPlayer.id)
      ? "A"
      : match.side_b.includes(myPlayer.id)
        ? "B"
        : null;
  const adminOfTrip = await isTripAdmin(trip.id);

  return (
    <div className="space-y-4">
      <Link
        href="/scorecard"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        All matches
      </Link>
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Day {round.day_number} · {round.format.replace("_", " ")}
        </p>
        <h1 className="font-serif text-2xl font-semibold">Match {match.match_number}</h1>
      </header>

      {holes.length === 0 ? (
        <p className="card text-sm text-muted-foreground">
          Course holes haven't been configured yet. Ask the admin to fill in par + stroke index.
        </p>
      ) : (
        <>
          <MatchLiveSync matchId={match.id} />
          <ScoreEntry
          round={{ id: round.id, format: round.format }}
          match={{
            id: match.id,
            side_a: match.side_a,
            side_b: match.side_b,
            team_a_name: teamAName,
            team_b_name: teamBName,
          }}
          mySide={mySide}
          isAdmin={adminOfTrip}
          players={players.map((p) => ({
            id: p.id,
            name: p.name,
            handicap_index: Number(p.handicap_index),
            user_id: p.user_id,
          }))}
          holes={holes.map((h) => ({
            hole_number: h.hole_number,
            par: h.par,
            stroke_index: h.stroke_index,
          }))}
          initialScores={scores.map((s) => ({
            hole_number: s.hole_number,
            player_id: s.player_id,
            team_side: s.team_side,
            gross: s.gross,
          }))}
        />
        </>
      )}
    </div>
  );
}
