import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Course, Player, Tee, Trip } from "@/lib/db";
import { Field, FormRow, SubmitButton } from "@/components/admin/section";
import { joinTripAction } from "./actions";

type PageProps = { params: Promise<{ code: string }> };

export default async function JoinPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/join/${code}`);

  const { data: tripRow } = await supabase
    .from("trips")
    .select("*")
    .eq("join_code", code)
    .maybeSingle();
  const trip = tripRow as Trip | null;

  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <Flag className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-semibold">Unknown code</h1>
        <p className="text-sm text-muted-foreground">
          That join code doesn't match any trip. Double-check with whoever shared it.
        </p>
        <Link href="/" className="btn-ghost mt-2 inline-flex">
          Back home
        </Link>
      </div>
    );
  }

  // Existing player on this trip?
  const { data: existing } = await supabase
    .from("players")
    .select("*")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const player = existing as Player | null;

  // Pre-fill name from profile if no player yet.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, handicap")
    .eq("id", user.id)
    .maybeSingle();

  const { data: course } = await supabase
    .from("courses")
    .select("id, name")
    .eq("trip_id", trip.id)
    .maybeSingle();
  let tees: Tee[] = [];
  if (course) {
    const { data } = await supabase.from("tees").select("*").eq("course_id", (course as Course).id);
    tees = (data ?? []) as Tee[];
  }

  return (
    <div className="space-y-6">
      <header className="text-center space-y-2">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
          <Flag className="h-5 w-5" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Join trip
        </p>
        <h1 className="font-serif text-3xl font-semibold">{trip.name}</h1>
        <p className="text-sm text-muted-foreground">
          {trip.location ? `${trip.location} · ` : ""}
          {trip.year}
        </p>
      </header>

      <form action={joinTripAction} className="card space-y-3">
        <input type="hidden" name="code" value={code} />

        <Field label="Display name">
          <input
            className="input"
            name="name"
            defaultValue={player?.name ?? profile?.display_name ?? ""}
            required
          />
        </Field>

        <FormRow>
          <Field label="Handicap index" hint="Use whole/decimal, e.g. 12.4">
            <input
              className="input"
              name="handicap_index"
              type="number"
              step="0.1"
              defaultValue={player?.handicap_index ?? profile?.handicap ?? 0}
              required
            />
          </Field>
          <Field label="Tee">
            <select className="input" name="tee_id" defaultValue={player?.tee_id ?? ""}>
              <option value="">— pick one —</option>
              {tees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </FormRow>

        <Field label="Venmo username" hint="Used for settle-up deep links. No money is actually moved.">
          <input
            className="input"
            name="venmo_username"
            placeholder="@your-venmo"
            defaultValue={player?.venmo_username ?? ""}
          />
        </Field>

        <SubmitButton>{player ? "Update profile" : "Join the trip"}</SubmitButton>
      </form>

      {player && (
        <p className="text-center text-sm text-muted-foreground">
          You're already on this trip. Updating your profile is safe.
        </p>
      )}
    </div>
  );
}
