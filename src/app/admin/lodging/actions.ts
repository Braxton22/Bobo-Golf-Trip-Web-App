"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";

export async function saveLodgingAction(formData: FormData) {
  const trip = await getActiveTrip();
  if (!trip) return;
  if (!(await isTripAdmin(trip.id))) return;
  const supabase = await createClient();

  const payload = {
    trip_id: trip.id,
    address: (String(formData.get("address") ?? "").trim() || null) as string | null,
    access_code: (String(formData.get("access_code") ?? "").trim() || null) as string | null,
    wifi_ssid: (String(formData.get("wifi_ssid") ?? "").trim() || null) as string | null,
    wifi_password: (String(formData.get("wifi_password") ?? "").trim() || null) as string | null,
    check_in: (String(formData.get("check_in") ?? "") || null) as string | null,
    check_out: (String(formData.get("check_out") ?? "") || null) as string | null,
    notes: (String(formData.get("notes") ?? "").trim() || null) as string | null,
  };

  await supabase.from("lodging").upsert(payload, { onConflict: "trip_id" });
  revalidatePath("/admin/lodging");
  revalidatePath("/info");
}
