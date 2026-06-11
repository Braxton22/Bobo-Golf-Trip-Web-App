import { redirect } from "next/navigation";
import { AlertCircle, Archive, ArchiveRestore, Check, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import type { Trip } from "@/lib/db";
import {
  archiveTripAction,
  createTripAction,
  switchTripAction,
  unarchiveTripAction,
} from "./actions";

export default async function TripsAdminPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/trips");

  const { data: tripsRaw } = await supabase
    .from("trips")
    .select("*")
    .order("archived", { ascending: true })
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });
  const trips = (tripsRaw ?? []) as Trip[];
  const active = await getActiveTrip();

  return (
    <AdminSection
      title="Trips"
      description="Create new trips, switch which one's active, or archive an old one."
      back={{ href: "/admin" }}
    >
      {searchParams.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{searchParams.error}</p>
        </div>
      )}
      <section className="card space-y-4">
        <header className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="font-medium">New trip</h2>
        </header>
        <form action={createTripAction} className="space-y-3">
          <FormRow>
            <Field label="Trip name">
              <input className="input" name="name" required placeholder="The 2026 Cup" />
            </Field>
            <Field label="Year">
              <input
                className="input"
                name="year"
                type="number"
                required
                defaultValue={new Date().getFullYear()}
              />
            </Field>
          </FormRow>
          <Field
            label="Trip type"
            hint="Ryder Cup = two teams, three days, the Cup. Casual = no teams; pick a format per round (medal, stableford, skins, match play, scramble, count-your-birdies)."
          >
            <select className="input" name="trip_type" defaultValue="ryder_cup">
              <option value="ryder_cup">Ryder Cup</option>
              <option value="casual">Casual — per-round formats</option>
            </select>
          </Field>
          <Field label="Location">
            <input className="input" name="location" placeholder="Pinehurst, NC" />
          </Field>
          <FormRow>
            <Field label="Start date">
              <input className="input" type="date" name="start_date" />
            </Field>
            <Field label="End date">
              <input className="input" type="date" name="end_date" />
            </Field>
          </FormRow>
          <Field label="Join code" hint="Leave blank to auto-generate.">
            <input
              className="input uppercase"
              name="join_code"
              placeholder="MASTERS26"
              maxLength={12}
            />
          </Field>
          <SubmitButton>Create trip</SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Your trips</h2>
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trips yet — create your first above.</p>
        ) : (
          <ul className="space-y-2">
            {trips.map((t) => {
              const isActive = active?.id === t.id;
              return (
                <li key={t.id} className="card flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">
                        {t.name} <span className="text-muted-foreground">({t.year})</span>
                      </div>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      )}
                      {t.archived && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.trip_type === "ryder_cup" ? "Ryder Cup" : "Casual"} ·{" "}
                      {t.location ?? "—"} · join code{" "}
                      <span className="font-mono">{t.join_code}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isActive && (
                      <form action={switchTripAction}>
                        <input type="hidden" name="trip_id" value={t.id} />
                        <button className="btn-ghost text-xs">Make active</button>
                      </form>
                    )}
                    {t.archived ? (
                      <form action={unarchiveTripAction}>
                        <input type="hidden" name="trip_id" value={t.id} />
                        <button className="btn-ghost text-xs inline-flex items-center gap-1">
                          <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                        </button>
                      </form>
                    ) : (
                      <form action={archiveTripAction}>
                        <input type="hidden" name="trip_id" value={t.id} />
                        <button className="btn-ghost text-xs inline-flex items-center gap-1">
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminSection>
  );
}
