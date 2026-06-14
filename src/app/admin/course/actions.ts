"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const SEED_PAR = [4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 5, 3, 4, 4, 3, 4, 5, 4];
const SEED_SI = [5, 11, 17, 7, 1, 13, 9, 15, 3, 6, 2, 18, 8, 10, 16, 14, 4, 12];

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function courseInTrip(supabase: SupabaseServer, courseId: string, tripId: string) {
  const { data } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("trip_id", tripId)
    .maybeSingle();
  return !!data;
}

/** Create a new course for the active trip + seed its 18 holes, then jump to
 *  its editor. A trip can have any number of courses. */
export async function createCourseAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim() || "Course";
  const lat = toNum(formData.get("latitude"));
  const lng = toNum(formData.get("longitude"));

  const { data: created } = await supabase
    .from("courses")
    .insert({ trip_id: trip.id, name, latitude: lat, longitude: lng })
    .select("id")
    .single();
  if (!created) return;

  await supabase.from("holes").insert(
    Array.from({ length: 18 }, (_, i) => ({
      course_id: created.id,
      hole_number: i + 1,
      par: SEED_PAR[i],
      stroke_index: SEED_SI[i],
    }))
  );

  revalidatePath("/admin/course");
  redirect(`/admin/course/${created.id}`);
}

export async function updateCourseInfoAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const id = String(formData.get("course_id") ?? "");
  if (!id || !(await courseInTrip(supabase, id, trip.id))) return;

  const name = String(formData.get("name") ?? "").trim() || "Course";
  const lat = toNum(formData.get("latitude"));
  const lng = toNum(formData.get("longitude"));
  await supabase.from("courses").update({ name, latitude: lat, longitude: lng }).eq("id", id);
  revalidatePath(`/admin/course/${id}`);
  revalidatePath("/admin/course");
}

export async function deleteCourseAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const id = String(formData.get("course_id") ?? "");
  if (!id || !(await courseInTrip(supabase, id, trip.id))) return;
  // Cascades to tees/holes/yardages; rounds.course_id is set null.
  await supabase.from("courses").delete().eq("id", id);
  revalidatePath("/admin/course");
  revalidatePath("/admin/rounds");
  redirect("/admin/course");
}

/**
 * Save all 18 holes for a course — par/SI plus per-tee yardages, in one grid.
 * Inputs: course_id, par_1..par_18, si_1..si_18, yards_<teeId>_<holeNumber>.
 * Empty yardage cells are left untouched. Pars clamped 3..6; SI clamped 1..18
 * (DB unique constraint rejects duplicate stroke indexes).
 */
export async function saveHolesAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const courseId = String(formData.get("course_id") ?? "");
  if (!courseId || !(await courseInTrip(supabase, courseId, trip.id))) return;

  const { data: holeRows } = await supabase
    .from("holes")
    .select("id, hole_number")
    .eq("course_id", courseId);
  const holes = holeRows ?? [];

  for (let n = 1; n <= 18; n++) {
    const par = Math.max(3, Math.min(6, toNum(formData.get(`par_${n}`), 4) ?? 4));
    const si = Math.max(1, Math.min(18, toNum(formData.get(`si_${n}`), n) ?? n));
    await supabase
      .from("holes")
      .update({ par, stroke_index: si })
      .eq("course_id", courseId)
      .eq("hole_number", n);
  }

  const { data: teeRows } = await supabase.from("tees").select("id").eq("course_id", courseId);
  const tees = teeRows ?? [];
  if (tees.length > 0 && holes.length > 0) {
    const holeIdByNum = new Map(holes.map((h) => [h.hole_number as number, h.id as string]));
    const rows: { hole_id: string; tee_id: string; yards: number }[] = [];
    for (const tee of tees) {
      for (let n = 1; n <= 18; n++) {
        const yards = toNum(formData.get(`yards_${tee.id}_${n}`));
        const hole_id = holeIdByNum.get(n);
        if (yards != null && hole_id) rows.push({ hole_id, tee_id: tee.id as string, yards });
      }
    }
    if (rows.length > 0) {
      await supabase.from("hole_yardages").upsert(rows, { onConflict: "hole_id,tee_id" });
    }
  }

  revalidatePath(`/admin/course/${courseId}`);
}

export async function addTeeAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const courseId = String(formData.get("course_id") ?? "");
  if (!courseId || !(await courseInTrip(supabase, courseId, trip.id))) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const rating = toNum(formData.get("course_rating"));
  const slope = toNum(formData.get("slope"));
  const par = toNum(formData.get("par"));
  await supabase
    .from("tees")
    .insert({ course_id: courseId, name, course_rating: rating, slope, par });
  revalidatePath(`/admin/course/${courseId}`);
}

export async function deleteTeeAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  if (!id) return;
  if (courseId && !(await courseInTrip(supabase, courseId, trip.id))) return;
  await supabase.from("tees").delete().eq("id", id);
  revalidatePath(`/admin/course/${courseId}`);
}
