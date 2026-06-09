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

function toNum(v: FormDataEntryValue | null, fallback: number | null = null): number | null {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Idempotent: creates the trip's course if it doesn't exist, otherwise updates
 * the existing one. Also seeds 18 hole rows with a default par-72 / canonical
 * stroke-index layout so the admin can just tweak values.
 */
export async function upsertCourseAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim() || "Course";
  const lat = toNum(formData.get("latitude"));
  const lng = toNum(formData.get("longitude"));

  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("trip_id", trip.id)
    .limit(1)
    .maybeSingle();

  let courseId: string;
  if (existing?.id) {
    await supabase
      .from("courses")
      .update({ name, latitude: lat, longitude: lng })
      .eq("id", existing.id);
    courseId = existing.id;
  } else {
    const { data: created } = await supabase
      .from("courses")
      .insert({ trip_id: trip.id, name, latitude: lat, longitude: lng })
      .select("id")
      .single();
    if (!created) return;
    courseId = created.id;
  }

  // Seed 18 holes if missing.
  const { data: holes } = await supabase
    .from("holes")
    .select("hole_number")
    .eq("course_id", courseId);
  if (!holes || holes.length === 0) {
    const PAR = [4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 5, 3, 4, 4, 3, 4, 5, 4];
    const SI =  [5, 11, 17, 7, 1, 13, 9, 15, 3, 6, 2, 18, 8, 10, 16, 14, 4, 12];
    const rows = Array.from({ length: 18 }, (_, i) => ({
      course_id: courseId,
      hole_number: i + 1,
      par: PAR[i],
      stroke_index: SI[i],
    }));
    await supabase.from("holes").insert(rows);
  }

  revalidatePath("/admin/course");
}

/**
 * Save all 18 holes at once. Inputs come as par_1..par_18 and si_1..si_18.
 * Stroke indices must be a permutation of 1..18; we don't enforce that here
 * (the DB unique constraint will reject duplicates), but we do clamp pars.
 */
export async function saveHolesAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!course) return;

  // Upsert each hole.
  for (let n = 1; n <= 18; n++) {
    const par = Math.max(3, Math.min(6, toNum(formData.get(`par_${n}`), 4) ?? 4));
    const si = Math.max(1, Math.min(18, toNum(formData.get(`si_${n}`), n) ?? n));
    // Update by (course_id, hole_number).
    await supabase
      .from("holes")
      .update({ par, stroke_index: si })
      .eq("course_id", course.id)
      .eq("hole_number", n);
  }
  revalidatePath("/admin/course");
}

export async function addTeeAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!course) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const rating = toNum(formData.get("course_rating"));
  const slope = toNum(formData.get("slope"));
  const par = toNum(formData.get("par"));
  await supabase
    .from("tees")
    .insert({ course_id: course.id, name, course_rating: rating, slope, par });
  revalidatePath("/admin/course");
}

export async function deleteTeeAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("tees").delete().eq("id", id);
  revalidatePath("/admin/course");
}

export async function saveYardagesAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const tee_id = String(formData.get("tee_id") ?? "");
  if (!tee_id) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!course) return;

  const { data: holes } = await supabase
    .from("holes")
    .select("id, hole_number")
    .eq("course_id", course.id);
  if (!holes) return;

  const rows = holes
    .map((h) => {
      const yards = toNum(formData.get(`yards_${h.hole_number}`));
      return yards == null ? null : { hole_id: h.id, tee_id, yards };
    })
    .filter((r): r is { hole_id: string; tee_id: string; yards: number } => r !== null);

  if (rows.length === 0) return;
  await supabase.from("hole_yardages").upsert(rows, { onConflict: "hole_id,tee_id" });
  revalidatePath("/admin/course");
}
