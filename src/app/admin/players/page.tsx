import { redirect } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Course, Player, Team, Tee } from "@/lib/db";
import {
  createPlayerAction,
  deletePlayerAction,
  updatePlayerAction,
} from "./actions";

export default async function PlayersAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/players");

  const trip = await getActiveTrip();
  if (!trip) return <NoTrip />;
  if (!(await isTripAdmin(trip.id))) redirect("/admin");

  const [{ data: playersRaw }, { data: teamsRaw }, { data: coursesRaw }] = await Promise.all([
    supabase.from("players").select("*").eq("trip_id", trip.id).order("name"),
    supabase.from("teams").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("courses").select("*").eq("trip_id", trip.id),
  ]);
  const players = (playersRaw ?? []) as Player[];
  const teams = (teamsRaw ?? []) as Team[];
  const courses = (coursesRaw ?? []) as Course[];
  let tees: Tee[] = [];
  if (courses.length > 0) {
    const { data } = await supabase
      .from("tees")
      .select("*")
      .in("course_id", courses.map((c) => c.id));
    tees = (data ?? []) as Tee[];
  }

  return (
    <AdminSection
      title="Players"
      description="Roster, handicap indexes, tee selection, tee times, Venmo."
      back={{ href: "/admin" }}
    >
      <section className="card space-y-3">
        <header className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Add a player</h2>
        </header>
        <form action={createPlayerAction} className="space-y-3">
          <FormRow>
            <Field label="Name">
              <input className="input" name="name" required />
            </Field>
            <Field label="Handicap index">
              <input
                className="input"
                name="handicap_index"
                type="number"
                step="0.1"
                defaultValue="0"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Team">
              <select className="input" name="team_id" defaultValue="">
                <option value="">— unassigned —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tee">
              <select className="input" name="tee_id" defaultValue="">
                <option value="">— none —</option>
                {tees.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Tee time">
              <input className="input" name="tee_time" type="time" />
            </Field>
            <Field label="Venmo username">
              <input className="input" name="venmo_username" placeholder="@hank-aaron" />
            </Field>
          </FormRow>
          <SubmitButton>Add player</SubmitButton>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Roster ({players.length})</h2>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">No players yet.</p>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li key={p.id} className="card space-y-3">
                <form action={updatePlayerAction} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <FormRow>
                    <Field label="Name">
                      <input className="input" name="name" defaultValue={p.name} required />
                    </Field>
                    <Field label="Handicap index">
                      <input
                        className="input"
                        name="handicap_index"
                        type="number"
                        step="0.1"
                        defaultValue={Number(p.handicap_index)}
                      />
                    </Field>
                  </FormRow>
                  <FormRow>
                    <Field label="Team">
                      <select className="input" name="team_id" defaultValue={p.team_id ?? ""}>
                        <option value="">— unassigned —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tee">
                      <select className="input" name="tee_id" defaultValue={p.tee_id ?? ""}>
                        <option value="">— none —</option>
                        {tees.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </FormRow>
                  <FormRow>
                    <Field label="Tee time">
                      <input
                        className="input"
                        name="tee_time"
                        type="time"
                        defaultValue={p.tee_time ?? ""}
                      />
                    </Field>
                    <Field label="Venmo username">
                      <input
                        className="input"
                        name="venmo_username"
                        defaultValue={p.venmo_username ?? ""}
                      />
                    </Field>
                  </FormRow>
                  <div className="flex items-center justify-between">
                    <SubmitButton className="btn-ghost">Save</SubmitButton>
                    <button
                      formAction={deletePlayerAction}
                      className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      type="submit"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminSection>
  );
}
