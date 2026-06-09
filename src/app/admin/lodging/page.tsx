import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";
import { AdminSection, Field, FormRow, SubmitButton } from "@/components/admin/section";
import { NoTrip } from "@/components/admin/no-trip";
import type { Lodging } from "@/lib/db";
import { saveLodgingAction } from "./actions";

export default async function LodgingAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/lodging");

  const trip = await getActiveTrip();
  if (!trip) return <NoTrip />;
  if (!(await isTripAdmin(trip.id))) redirect("/admin");

  const { data } = await supabase
    .from("lodging")
    .select("*")
    .eq("trip_id", trip.id)
    .maybeSingle();
  const lodging = (data as Lodging | null) ?? null;

  return (
    <AdminSection title="Lodging" description="Where the boys are sleeping." back={{ href: "/admin" }}>
      <form action={saveLodgingAction} className="card space-y-3">
        <Field label="Address">
          <input
            className="input"
            name="address"
            defaultValue={lodging?.address ?? ""}
            placeholder="123 Fairway Ln, Pinehurst NC"
          />
        </Field>
        <FormRow>
          <Field label="Access code">
            <input className="input" name="access_code" defaultValue={lodging?.access_code ?? ""} />
          </Field>
          <Field label="WiFi SSID">
            <input className="input" name="wifi_ssid" defaultValue={lodging?.wifi_ssid ?? ""} />
          </Field>
        </FormRow>
        <Field label="WiFi password">
          <input className="input" name="wifi_password" defaultValue={lodging?.wifi_password ?? ""} />
        </Field>
        <FormRow>
          <Field label="Check-in">
            <input
              className="input"
              type="datetime-local"
              name="check_in"
              defaultValue={lodging?.check_in?.slice(0, 16) ?? ""}
            />
          </Field>
          <Field label="Check-out">
            <input
              className="input"
              type="datetime-local"
              name="check_out"
              defaultValue={lodging?.check_out?.slice(0, 16) ?? ""}
            />
          </Field>
        </FormRow>
        <Field label="Notes">
          <textarea
            className="input min-h-24"
            name="notes"
            defaultValue={lodging?.notes ?? ""}
            placeholder="Trash pickup Tue. Hot tub turns off at 11pm."
          />
        </Field>
        <SubmitButton>Save lodging</SubmitButton>
      </form>
    </AdminSection>
  );
}
