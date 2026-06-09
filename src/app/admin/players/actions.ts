"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip, isTripAdmin } from "@/lib/trip-context";

async function requireActiveAdmin() {
  const trip = await getActiveTrip();
  if (!trip) return null;
  if (!(await isTripAdmin(trip.id))) return null;
  return trip;
}

function toNum(v: FormDataEntryValue | null, fallback: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function createPlayerAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const name = String(formData.get("name") ?? "").trim();
  const handicap = toNum(formData.get("handicap_index"), 0);
  const tee_id = (String(formData.get("tee_id") ?? "") || null) as string | null;
  const tee_time = (String(formData.get("tee_time") ?? "") || null) as string | null;
  const venmo = (String(formData.get("venmo_username") ?? "").trim() || null) as string | null;
  const team_id = (String(formData.get("team_id") ?? "") || null) as string | null;
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("players").insert({
    trip_id: trip.id,
    name,
    handicap_index: handicap,
    tee_id,
    tee_time,
    venmo_username: venmo,
    team_id,
  });
  revalidatePath("/admin/players");
  revalidatePath("/admin/teams");
}

export async function updatePlayerAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim();
  const handicap = toNum(formData.get("handicap_index"), 0);
  const tee_id = (String(formData.get("tee_id") ?? "") || null) as string | null;
  const tee_time = (String(formData.get("tee_time") ?? "") || null) as string | null;
  const venmo = (String(formData.get("venmo_username") ?? "").trim() || null) as string | null;
  const team_id = (String(formData.get("team_id") ?? "") || null) as string | null;
  const supabase = await createClient();
  await supabase
    .from("players")
    .update({
      name,
      handicap_index: handicap,
      tee_id,
      tee_time,
      venmo_username: venmo,
      team_id,
    })
    .eq("id", id)
    .eq("trip_id", trip.id);
  revalidatePath("/admin/players");
  revalidatePath("/admin/teams");
}

export async function deletePlayerAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("players").delete().eq("id", id).eq("trip_id", trip.id);
  revalidatePath("/admin/players");
  revalidatePath("/admin/teams");
}
