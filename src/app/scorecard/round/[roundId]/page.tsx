import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import type { Hole, Match, Player, Round, Score } from "@/lib/db";
import { FORMAT_META, isSoloFormat } from "@/lib/trip-formats";
import { SoloEntry } from "./solo-entry";

type PageProps = { params: Promise<{ roundId: string }> };

/**
 * Score entry for casual-format rounds — solo formats (medal, stableford,
 * skins, count-your-birdies) and group scramble. Match-based rounds keep
 * using /scorecard/[matchId].
 */
export default async function RoundScorePage({ params }: PageProps) {
  const { roundId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/scorecard/round/${roundId}`);

  const trip = await getActiveTrip();
  if (!trip) redirect("/scorecard");

  const { data: roundRow } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();
  const round = roundRow as Round | null;
  if (!round || round.trip_id !== trip.id) {
    return (
      <div className="card text-center space-y-2">
        <p className="text-sm text-muted-foreground">Round not found.</p>
        <Link href="/scorecard" className="btn-ghost mt-2 inline-flex">
          Back
        </Link>
      </div>
    );
  }

  const solo = isSoloFormat(round.format);
  const isGroup = round.format === "group_scramble";
  if (!solo && !isGroup) redirect("/scorecard");

  const [{ data: playersRaw }, { data: holesRaw }, { data: scoresRaw }, { data: matchesRaw }] =
    await Promise.all([
      supabase.from("players").select("*").eq("trip_id", trip.id).order("name"),
      round.course_id
        ? supabase.from("holes").select("*").eq("course_id", round.course_id).order("hole_number")
        : Promise.resolve({ data: [] as Hole[] }),
      supabase.from("scores").select("*").eq("round_id", round.id),
      isGroup
        ? supabase.from("matches").select("*").eq("round_id", round.id).order("match_number")
        : Promise.resolve({ data: [] as Match[] }),
    ]);
  const players = (playersRaw ?? []) as Player[];
  const holes = (holesRaw ?? []) as Hole[];
  const scores = (scoresRaw ?? []) as Score[];
  const groups = (matchesRaw ?? []) as Match[];

  const myPlayer = players.find((p) => p.user_id === user.id) ?? null;
  const adminOfTrip = await isTripAdmin(trip.id);

  const writablePlayers = solo
    ? adminOfTrip
      ? players
      : myPlayer
        ? [myPlayer]
        : []
    : [];

  const writableGroupIds = isGroup
    ? groups
        .filter((g) => adminOfTrip || (myPlayer && g.side_a.includes(myPlayer.id)))
        .map((g) => g.id)
    : [];

  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const meta = FORMAT_META[round.format];

  return (
    <div className="space-y-4">
      <Link
        href="/scorecard"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Scorecard
      </Link>
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Day {round.day_number}
        </p>
        <h1 className="font-serif text-2xl font-semibold">{meta.label}</h1>
      </header>

      <section className="card space-y-2">
        <p className="rounded-xl bg-[hsl(var(--gold))]/15 px-3 py-2 text-xs text-[hsl(var(--ink))]">
          <strong>Who enters?</strong> {meta.entryRule}
        </p>
        <p className="text-xs text-muted-foreground">{meta.scoringRule}</p>
      </section>

      {holes.length === 0 ? (
        <p className="card text-sm text-muted-foreground">
          Course holes haven't been configured yet. Ask the admin to fill in par + stroke index.
        </p>
      ) : (
        <SoloEntry
          round={{ id: round.id, format: round.format }}
          holes={holes.map((h) => ({
            hole_number: h.hole_number,
            par: h.par,
            stroke_index: h.stroke_index,
          }))}
          writablePlayers={writablePlayers.map((p) => ({
            id: p.id,
            name: p.name,
            handicap_index: Number(p.handicap_index),
          }))}
          groups={groups.map((g) => ({
            id: g.id,
            number: g.match_number,
            memberIds: g.side_a,
            label: g.side_a.map((id) => nameById.get(id) ?? "?").join(", "),
          }))}
          writableGroupIds={writableGroupIds}
          initialScores={scores
            .filter((s) => (isGroup ? s.team_side === "A" : s.player_id != null && s.match_id == null))
            .map((s) => ({
              hole_number: s.hole_number,
              player_id: s.player_id,
              match_id: s.match_id,
              gross: s.gross,
            }))}
        />
      )}
    </div>
  );
}
