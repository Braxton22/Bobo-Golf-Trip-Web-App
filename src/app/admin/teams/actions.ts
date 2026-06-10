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

export async function createTeamAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("teams").insert({ trip_id: trip.id, name, color });
  revalidatePath("/admin/teams");
}

export async function updateTeamAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  if (!id || !name) return;
  const supabase = await createClient();
  await supabase
    .from("teams")
    .update({ name, color })
    .eq("id", id)
    .eq("trip_id", trip.id);
  revalidatePath("/admin/teams");
}

export async function deleteTeamAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("teams").delete().eq("id", id).eq("trip_id", trip.id);
  revalidatePath("/admin/teams");
}

export async function assignPlayerToTeamAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const player_id = String(formData.get("player_id") ?? "");
  const raw = String(formData.get("team_id") ?? "");
  const team_id = raw === "" ? null : raw;
  if (!player_id) return;
  const supabase = await createClient();
  await supabase.from("players").update({ team_id }).eq("id", player_id).eq("trip_id", trip.id);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/players");
}
