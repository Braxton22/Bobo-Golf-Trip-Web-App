"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateJoinCode, setActiveTripCookie } from "@/lib/trip-context";
import { ensureProfile } from "@/lib/ensure-profile";

function toNum(v: FormDataEntryValue | null, fallback: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function createTripAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/trips");

  const name = String(formData.get("name") ?? "").trim();
  const year = toNum(formData.get("year"), new Date().getFullYear());
  const location = String(formData.get("location") ?? "").trim() || null;
  const startDate = String(formData.get("start_date") ?? "") || null;
  const endDate = String(formData.get("end_date") ?? "") || null;
  let joinCode = String(formData.get("join_code") ?? "").trim().toUpperCase() || null;

  if (!name) redirect("/admin/trips?error=" + encodeURIComponent("Trip name is required."));

  if (!joinCode) joinCode = generateJoinCode(name);

  // The trips.created_by FK points at profiles(id). Self-heal a missing
  // profile row (e.g. account predates a DB reset) before inserting.
  await ensureProfile(user);

  // Retry a couple of times in case of an unlikely join-code collision.
  let inserted: { id: string } | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    const code = attempt === 0 ? joinCode : generateJoinCode(name);
    const { data, error } = await supabase
      .from("trips")
      .insert({
        name,
        year,
        location,
        start_date: startDate,
        end_date: endDate,
        join_code: code,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (!error && data) inserted = data;
    else lastError = error?.message ?? "Unknown error";
  }

  if (!inserted) {
    redirect(
      "/admin/trips?error=" +
        encodeURIComponent(`Couldn't create the trip: ${lastError ?? "unknown error"}`)
    );
  }

  // Author becomes an admin automatically (DB also treats created_by as admin).
  await supabase.from("trip_admins").upsert({ trip_id: inserted.id, user_id: user.id });

  // Default the two teams so the rest of the admin flow has something to attach to.
  await supabase.from("teams").insert([
    { trip_id: inserted.id, name: "Team Pine", color: "#0B3D2E" },
    { trip_id: inserted.id, name: "Team Sand", color: "#C8A951" },
  ]);

  await setActiveTripCookie(inserted.id);
  revalidatePath("/admin/trips");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function switchTripAction(formData: FormData) {
  const id = String(formData.get("trip_id") ?? "");
  if (!id) return;
  await setActiveTripCookie(id);
  revalidatePath("/admin");
  revalidatePath("/admin/trips");
  redirect("/admin");
}

export async function archiveTripAction(formData: FormData) {
  const id = String(formData.get("trip_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("trips").update({ archived: true, active: false }).eq("id", id);
  revalidatePath("/admin/trips");
}

export async function unarchiveTripAction(formData: FormData) {
  const id = String(formData.get("trip_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("trips").update({ archived: false }).eq("id", id);
  revalidatePath("/admin/trips");
}
