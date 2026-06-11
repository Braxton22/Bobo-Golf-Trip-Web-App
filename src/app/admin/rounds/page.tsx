import { redirect } from "next/navigation";
import { Calendar, Clock, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Match, Player, PlayerRoundSettings, Round, Team, Tee } from "@/lib/db";
import { CASUAL_FORMATS, FORMAT_LABEL, isSoloFormat } from "@/lib/trip-formats";
import {
  bootstrapRoundsAction,
  createGroupAction,
  createMatchAction,
  createRoundAction,
  deleteMatchAction,
  deleteRoundAction,
  savePlayerRoundSettingsAction,
  updateRoundAction,
} from "./actions";

const SIDE_SIZE: Partial<Record<Round["format"], number>> = {
  scramble: 2,
  best_ball_bonus: 2,
  singles: 1,
  match_play: 1,
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
  const isRyder = trip.trip_type === "ryder_cup";

  const [{ data: roundsRaw }, { data: playersRaw }, { data: teamsRaw }, { data: coursesRaw }] = await Promise.all([
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
    supabase.from("players").select("*").eq("trip_id", trip.id).order("name"),
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("courses").select("id").eq("trip_id", trip.id),
  ]);
  const rounds = (roundsRaw ?? []) as Round[];
  const players = (playersRaw ?? []) as Player[];
  const teams = (teamsRaw ?? []) as Team[];
  const courseIds = (coursesRaw ?? []).map((c) => c.id as string);

  // Tees for any course on the trip + per-round settings for every player.
  let tees: Tee[] = [];
  let prs: PlayerRoundSettings[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase.from("tees").select("*").in("course_id", courseIds);
    tees = (data ?? []) as Tee[];
  }
  if (rounds.length > 0) {
    const { data } = await supabase
      .from("player_round_settings")
      .select("*")
      .in("round_id", rounds.map((r) => r.id));
    prs = (data ?? []) as PlayerRoundSettings[];
  }
  const prsByRoundPlayer = new Map<string, PlayerRoundSettings>();
  for (const r of prs) prsByRoundPlayer.set(`${r.round_id}|${r.player_id}`, r);

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
  const nextDay = (rounds[rounds.length - 1]?.day_number ?? 0) + 1;

  return (
    <AdminSection
      title={isRyder ? "Rounds & matches" : "Rounds"}
      description={
        isRyder
          ? "Three days, twelve points. Configure each day's matches."
          : "Add a round per day and pick its format. Matches/groups only apply to match play and scramble."
      }
      back={{ href: "/admin" }}
    >
      {/* Ryder Cup bootstrap vs casual add-round ----------------------------- */}
      {isRyder && rounds.length === 0 && (
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
      )}

      {!isRyder && (
        <section className="card space-y-3">
          <header className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Add a round</h2>
          </header>
          <form action={createRoundAction} className="space-y-3">
            <FormRow>
              <Field label="Day #">
                <input
                  className="input"
                  name="day_number"
                  type="number"
                  min={1}
                  max={14}
                  defaultValue={Math.min(nextDay, 14)}
                  required
                />
              </Field>
              <Field label="Format">
                <select className="input" name="format" defaultValue="medal" required>
                  {CASUAL_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_LABEL[f]}
                    </option>
                  ))}
                </select>
              </Field>
            </FormRow>
            <Field label="Date">
              <input className="input" type="date" name="date" />
            </Field>
            <SubmitButton>Add round</SubmitButton>
          </form>
        </section>
      )}

      {rounds.map((round) => {
        const roundMatches = matches.filter((m) => m.round_id === round.id);
        const sideSize = SIDE_SIZE[round.format] ?? 1;
        const solo = isSoloFormat(round.format);
        return (
          <section key={round.id} className="card space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold">Day {round.day_number}</h2>
                <p className="text-sm text-muted-foreground">{FORMAT_LABEL[round.format]}</p>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                {!isRyder && (
                  <form action={deleteRoundAction}>
                    <input type="hidden" name="id" value={round.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete day
                    </button>
                  </form>
                )}
              </div>
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
                {isRyder ? (
                  <Field label="Points / match">
                    <input
                      className="input"
                      type="number"
                      step="0.5"
                      name="points_per_match"
                      defaultValue={Number(round.points_per_match)}
                    />
                  </Field>
                ) : (
                  <input
                    type="hidden"
                    name="points_per_match"
                    value={Number(round.points_per_match)}
                  />
                )}
              </FormRow>
              <SubmitButton className="btn-ghost">Save day</SubmitButton>
            </form>

            {/* Per-player tee + tee time for THIS day. */}
            <div className="border-t border-line pt-3 space-y-3">
              <h3 className="label inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Tee & tee time
              </h3>
              {players.length === 0 || tees.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {players.length === 0
                    ? "Add players first."
                    : "Add a tee on the Course page first."}
                </p>
              ) : (
                <form action={savePlayerRoundSettingsAction} className="space-y-2">
                  <input type="hidden" name="round_id" value={round.id} />
                  <div className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="text-left py-1.5 pr-2">Player</th>
                          <th className="text-left py-1.5 pr-2">Tee</th>
                          <th className="text-left py-1.5">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p) => {
                          const setting = prsByRoundPlayer.get(`${round.id}|${p.id}`);
                          return (
                            <tr key={p.id} className="border-t border-line">
                              <td className="py-1.5 pr-2 truncate">{p.name}</td>
                              <td className="py-1.5 pr-2">
                                <select
                                  name={`tee_${p.id}`}
                                  className="input h-9 text-sm"
                                  defaultValue={setting?.tee_id ?? ""}
                                >
                                  <option value="">—</option>
                                  {tees.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-1.5">
                                <input
                                  type="time"
                                  name={`time_${p.id}`}
                                  className="input h-9 text-sm"
                                  defaultValue={setting?.tee_time ?? ""}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <SubmitButton className="btn-ghost">Save tees & times</SubmitButton>
                </form>
              )}
            </div>

            {/* Matches / groups — depends on format. Solo formats need none. */}
            {solo ? (
              <p className="border-t border-line pt-3 text-xs text-muted-foreground">
                {FORMAT_LABEL[round.format]} — everyone plays their own ball. No
                matches to set up; players enter scores from the Scorecard tab.
              </p>
            ) : round.format === "group_scramble" ? (
              <div className="border-t border-line pt-3 space-y-3">
                <h3 className="label inline-flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Groups
                </h3>
                {roundMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No groups yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {roundMatches.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-background/40 p-3"
                      >
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Group {m.match_number}
                        </span>
                        <span className="text-sm">{m.side_a.map(playerName).join(", ") || "—"}</span>
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
                <form action={createGroupAction} className="space-y-2 border-t border-line pt-3">
                  <input type="hidden" name="round_id" value={round.id} />
                  <span className="label">New group — pick the players</span>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {players.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg border border-line bg-background/40 px-2.5 py-2 text-sm"
                      >
                        <input type="checkbox" name="members" value={p.id} className="accent-[hsl(var(--primary))]" />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                  <SubmitButton>Add group</SubmitButton>
                </form>
              </div>
            ) : (
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

                {isRyder ? (
                  teams.length >= 2 ? (
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
                  )
                ) : (
                  // Casual match play: anyone vs anyone, no team layer.
                  <form
                    action={createMatchAction}
                    className="grid gap-3 sm:grid-cols-2 border-t border-line pt-3"
                  >
                    <input type="hidden" name="round_id" value={round.id} />
                    <div className="space-y-2">
                      <span className="label">Player A</span>
                      <select className="input" name="side_a" required defaultValue="" aria-label="Player A">
                        <option value="" disabled>
                          Pick player…
                        </option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <span className="label">Player B</span>
                      <select className="input" name="side_b" required defaultValue="" aria-label="Player B">
                        <option value="" disabled>
                          Pick player…
                        </option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton>Add match</SubmitButton>
                    </div>
                  </form>
                )}
              </div>
            )}
          </section>
        );
      })}
    </AdminSection>
  );
}
