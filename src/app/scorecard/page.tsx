import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { autoLinkPlayers } from "@/lib/ensure-profile";
import type { Match, Player, Round } from "@/lib/db";
import { FORMAT_LABEL, isSoloFormat } from "@/lib/trip-formats";

export default async function ScorecardIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/scorecard");
  await autoLinkPlayers();

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-3">
        <Flag className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
        <p className="text-sm text-muted-foreground">
          Ask your trip's organizer for a join code, then visit /join/&lt;code&gt;.
        </p>
      </div>
    );
  }

  // Find this user's player rows on the active trip.
  const { data: playerRows } = await supabase
    .from("players")
    .select("*")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id);
  const myPlayers = (playerRows ?? []) as Player[];

  const { data: roundsRaw } = await supabase
    .from("rounds")
    .select("*")
    .eq("trip_id", trip.id)
    .order("day_number");
  const rounds = (roundsRaw ?? []) as Round[];

  let matches: Match[] = [];
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .in("round_id", rounds.map((r) => r.id))
      .order("match_number");
    matches = (data ?? []) as Match[];
  }

  const myPlayerIds = new Set(myPlayers.map((p) => p.id));
  const matchesByRound = new Map<string, Match[]>();
  for (const r of rounds) matchesByRound.set(r.id, []);
  for (const m of matches) matchesByRound.get(m.round_id)?.push(m);

  // Load names for opposing players.
  const allPlayerIds = new Set<string>();
  for (const m of matches) {
    m.side_a.forEach((id) => allPlayerIds.add(id));
    m.side_b.forEach((id) => allPlayerIds.add(id));
  }
  let nameById = new Map<string, string>();
  if (allPlayerIds.size > 0) {
    const { data } = await supabase
      .from("players")
      .select("id, name")
      .in("id", [...allPlayerIds]);
    nameById = new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold">Scorecard</h1>
        <p className="text-sm text-muted-foreground">
          {trip.name} · {trip.year}
        </p>
      </header>

      {rounds.length === 0 ? (
        <p className="card text-sm text-muted-foreground">
          No rounds scheduled yet. Ask the trip's admin to set them up.
        </p>
      ) : (
        <ul className="space-y-4">
          {rounds.map((r) => {
            const rm = matchesByRound.get(r.id) ?? [];
            const mine = rm.filter(
              (m) => m.side_a.some((id) => myPlayerIds.has(id)) || m.side_b.some((id) => myPlayerIds.has(id))
            );
            const solo = isSoloFormat(r.format);
            const isGroup = r.format === "group_scramble";
            return (
              <li key={r.id} className="space-y-2">
                <header className="flex items-baseline justify-between">
                  <h2 className="font-serif text-xl font-semibold">Day {r.day_number}</h2>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {FORMAT_LABEL[r.format]}
                  </span>
                </header>

                {solo || isGroup ? (
                  <Link
                    href={`/scorecard/round/${r.id}`}
                    className="card flex items-center gap-3 transition hover:shadow-lift"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {FORMAT_LABEL[r.format]}
                      </div>
                      <div className="mt-0.5 font-medium">
                        {isGroup
                          ? rm.length > 0
                            ? `${rm.length} group${rm.length === 1 ? "" : "s"} — post your group's score`
                            : "No groups yet — ask the admin"
                          : "Enter your own scores"}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                ) : rm.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matches yet.</p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {rm.map((m) => {
                        const youIn =
                          m.side_a.some((id) => myPlayerIds.has(id)) ||
                          m.side_b.some((id) => myPlayerIds.has(id));
                        const a = m.side_a.map((id) => nameById.get(id) ?? "?").join(" & ");
                        const b = m.side_b.map((id) => nameById.get(id) ?? "?").join(" & ");
                        return (
                          <li key={m.id}>
                            <Link
                              href={`/scorecard/${m.id}`}
                              className="card flex items-center gap-3 transition hover:shadow-lift"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Match {m.match_number}
                                  {youIn && <span className="ml-2 text-primary">· You're playing</span>}
                                </div>
                                <div className="mt-0.5 font-medium truncate">
                                  {a} <span className="text-muted-foreground">vs</span> {b}
                                </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    {mine.length === 0 && rm.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        You're not in any matches today — tap to spectate / enter scores.
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
