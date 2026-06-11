import { redirect } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Player, Team } from "@/lib/db";
import {
  assignPlayerToTeamAction,
  createTeamAction,
  deleteTeamAction,
  updateTeamAction,
} from "./actions";

export default async function TeamsAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/teams");

  const trip = await getActiveTrip();
  if (!trip) return <NoTrip />;
  if (!(await isTripAdmin(trip.id))) redirect("/admin");

  // Teams only exist on Ryder Cup trips.
  if (trip.trip_type !== "ryder_cup") {
    return (
      <AdminSection
        title="Teams"
        description="This is a casual trip — there are no teams."
        back={{ href: "/admin" }}
      >
        <p className="card text-sm text-muted-foreground">
          Casual trips score per round (medal, stableford, skins, match play,
          scramble groups) without a team-vs-team layer. Set up days and
          formats under Rounds instead.
        </p>
      </AdminSection>
    );
  }

  const [{ data: teamsRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("players").select("*").eq("trip_id", trip.id).order("name"),
  ]);
  const teams = (teamsRaw ?? []) as Team[];
  const players = (playersRaw ?? []) as Player[];

  const unassigned = players.filter((p) => !p.team_id);

  return (
    <AdminSection
      title="Teams"
      description="Two teams of six. Set captains and assign players."
      back={{ href: "/admin" }}
    >
      <section className="card space-y-3">
        <h2 className="font-medium">Add a team</h2>
        <form action={createTeamAction} className="space-y-3">
          <FormRow>
            <Field label="Name">
              <input className="input" name="name" required placeholder="Team USA" />
            </Field>
            <Field label="Color (optional)">
              <input className="input" name="color" placeholder="#0B3D2E" />
            </Field>
          </FormRow>
          <SubmitButton>Create team</SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        {teams.map((team) => {
          const members = players.filter((p) => p.team_id === team.id);
          return (
            <article key={team.id} className="card space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-7 w-7 rounded-full border border-line shadow-soft"
                    style={{ background: team.color ?? "transparent" }}
                  />
                  <h3 className="font-serif text-xl font-semibold">{team.name}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {members.length} / 6
                  </span>
                </div>
                <form action={deleteTeamAction}>
                  <input type="hidden" name="id" value={team.id} />
                  <button className="btn-ghost text-xs inline-flex items-center gap-1" type="submit">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </form>
              </header>

              <form action={updateTeamAction} className="space-y-3">
                <input type="hidden" name="id" value={team.id} />
                <FormRow>
                  <Field label="Name">
                    <input className="input" name="name" defaultValue={team.name} required />
                  </Field>
                  <Field label="Color">
                    <input className="input" name="color" defaultValue={team.color ?? ""} />
                  </Field>
                </FormRow>
                <SubmitButton className="btn-ghost">Save</SubmitButton>
              </form>

              <div className="border-t border-line pt-3">
                <h4 className="label">Roster</h4>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No players assigned yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {members.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          {p.name}{" "}
                          <span className="text-muted-foreground">
                            ({Number(p.handicap_index).toFixed(1)})
                          </span>
                        </span>
                        <form action={assignPlayerToTeamAction}>
                          <input type="hidden" name="player_id" value={p.id} />
                          <input type="hidden" name="team_id" value="" />
                          <button className="text-xs text-muted-foreground hover:text-foreground" type="submit">
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                {unassigned.length > 0 && (
                  <form action={assignPlayerToTeamAction} className="mt-3 flex gap-2">
                    <input type="hidden" name="team_id" value={team.id} />
                    <select className="input" name="player_id" defaultValue="">
                      <option value="" disabled>
                        Add a player…
                      </option>
                      {unassigned.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn inline-flex items-center gap-1.5" type="submit">
                      <UserPlus className="h-4 w-4" /> Add
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </AdminSection>
  );
}
