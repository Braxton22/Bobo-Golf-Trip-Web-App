"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setActiveTripCookie } from "@/lib/trip-context";
import { ensureProfile } from "@/lib/ensure-profile";

function toNum(v: FormDataEntryValue | null, fallback: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Join action. Idempotent: if the user is already a player on this trip,
 * we update their profile fields rather than insert a duplicate row.
 */
export async function joinTripAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/join/${code}`);

  // players.user_id FKs to profiles(id) — self-heal a missing profile row.
  await ensureProfile(user);

  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("join_code", code)
    .maybeSingle();
  if (!trip) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const handicap = toNum(formData.get("handicap_index"), 0);
  const venmo = (String(formData.get("venmo_username") ?? "").trim() || null) as string | null;

  // Already on the trip?
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("players")
      .update({ name, handicap_index: handicap, venmo_username: venmo })
      .eq("id", existing.id);
  } else {
    await supabase.from("players").insert({
      trip_id: trip.id,
      user_id: user.id,
      name,
      handicap_index: handicap,
      venmo_username: venmo,
    });
  }

  // Reflect on the user's profile too.
  await supabase
    .from("profiles")
    .update({ display_name: name, handicap })
    .eq("id", user.id);

  await setActiveTripCookie(trip.id);
  revalidatePath(`/join/${code}`);
  redirect("/leaderboard");
}
