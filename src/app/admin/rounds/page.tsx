import { redirect } from "next/navigation";
import { Calendar, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Match, Player, Round, Team } from "@/lib/db";
import {
  bootstrapRoundsAction,
  createMatchAction,
  deleteMatchAction,
  updateRoundAction,
} from "./actions";

const FORMAT_LABEL: Record<Round["format"], string> = {
  scramble: "Scramble (2-man pair)",
  best_ball_bonus: "Best Ball + Bonus (2-man pair)",
  singles: "Singles (1v1)",
};

const SIDE_SIZE: Record<Round["format"], number> = {
  scramble: 2,
  best_ball_bonus: 2,
  singles: 1,
};

export default async function RoundsAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/rounds");

  const trip = await getActiveTrip();
  if (!trip) return <NoTrip />;
  if (!(await isTripAdmin(trip.id))) redirect("/admin");

  const [{ data: roundsRaw }, { data: playersRaw }, { data: teamsRaw }] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id).order("name"),
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const teams = (teamsRaw ?? []) as Team[];

  let matches: Match[] = [];
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .in("round_id", rounds.map((r) => r.id))
      .order("match_number");
    matches = (data ?? []) as Match[];
  }

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const playersByTeam = (teamId: string) => players.filter((p) => p.team_id === teamId);
  const teamA = teams[0] ?? null;
  const teamB = teams[1] ?? null;

  return (
    <AdminSection
      title="Rounds & matches"
      description="Three days, twelve points. Configure each day's matches."
      back={{ href: "/admin" }}
    >
      {rounds.length === 0 ? (
        <section className="card space-y-3">
          <h2 className="font-medium">Bootstrap the three days</h2>
          <p className="text-sm text-muted-foreground">
            Creates Day 1 (scramble), Day 2 (best ball + bonus), Day 3 (singles).
            You'll set dates and matches next.
          </p>
          <form action={bootstrapRoundsAction}>
            <SubmitButton>Create the 3 rounds</SubmitButton>
          </form>
        </section>
      ) : (
        rounds.map((round) => {
          const roundMatches = matches.filter((m) => m.round_id === round.id);
          const sideSize = SIDE_SIZE[round.format];
          return (
            <section key={round.id} className="card space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif text-xl font-semibold">Day {round.day_number}</h2>
                  <p className="text-sm text-muted-foreground">{FORMAT_LABEL[round.format]}</p>
                </div>
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </header>

              <form action={updateRoundAction} className="space-y-3">
                <input type="hidden" name="id" value={round.id} />
                <FormRow>
                  <Field label="Date">
                    <input
                      className="input"
                      type="date"
                      name="date"
                      defaultValue={round.date ?? ""}
                    />
                  </Field>
                  <Field label="Points / match">
                    <input
                      className="input"
                      type="number"
                      step="0.5"
                      name="points_per_match"
                      defaultValue={Number(round.points_per_match)}
                    />
                  </Field>
                </FormRow>
                <SubmitButton className="btn-ghost">Save day</SubmitButton>
              </form>

              <div className="border-t border-line pt-3 space-y-3">
                <h3 className="label">Matches</h3>
                {roundMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matches yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {roundMatches.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-background/40 p-3"
                      >
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Match {m.match_number}
                        </span>
                        <span className="text-sm">
                          <strong>A:</strong> {m.side_a.map(playerName).join(" & ") || "—"}
                          <span className="mx-2 text-muted-foreground">vs</span>
                          <strong>B:</strong> {m.side_b.map(playerName).join(" & ") || "—"}
                        </span>
                        <form action={deleteMatchAction} className="ml-auto">
                          <input type="hidden" name="id" value={m.id} />
                          <button
                            type="submit"
                            className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {teams.length >= 2 ? (
                  <form
                    action={createMatchAction}
                    className="grid gap-3 sm:grid-cols-2 border-t border-line pt-3"
                  >
                    <input type="hidden" name="round_id" value={round.id} />
                    <input type="hidden" name="team_a_id" value={teamA?.id ?? ""} />
                    <input type="hidden" name="team_b_id" value={teamB?.id ?? ""} />

                    <div className="space-y-2">
                      <span className="label">
                        Side A — {teamA?.name ?? "Team A"} ({sideSize})
                      </span>
                      {Array.from({ length: sideSize }, (_, i) => (
                        <select
                          key={i}
                          className="input"
                          name="side_a"
                          required
                          defaultValue=""
                          aria-label={`Side A player ${i + 1}`}
                        >
                          <option value="" disabled>
                            Pick player…
                          </option>
                          {teamA
                            ? playersByTeam(teamA.id).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))
                            : null}
                        </select>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <span className="label">
                        Side B — {teamB?.name ?? "Team B"} ({sideSize})
                      </span>
                      {Array.from({ length: sideSize }, (_, i) => (
                        <select
                          key={i}
                          className="input"
                          name="side_b"
                          required
                          defaultValue=""
                          aria-label={`Side B player ${i + 1}`}
                        >
                          <option value="" disabled>
                            Pick player…
                          </option>
                          {teamB
                            ? playersByTeam(teamB.id).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))
                            : null}
                        </select>
                      ))}
                    </div>

                    <div className="sm:col-span-2">
                      <SubmitButton>Add match</SubmitButton>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add two teams in{" "}
                    <a href="/admin/teams" className="underline">
                      Teams
                    </a>{" "}
                    to schedule matches.
                  </p>
                )}
              </div>
            </section>
          );
        })
      )}
    </AdminSection>
  );
}
