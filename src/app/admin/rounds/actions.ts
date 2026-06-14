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

/** When a trip has exactly one course, new rounds default to it; with zero or
 *  several courses we leave the round unassigned so the admin picks per day. */
async function defaultCourseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string
): Promise<string | null> {
  const { data } = await supabase.from("courses").select("id").eq("trip_id", tripId);
  return data && data.length === 1 ? (data[0].id as string) : null;
}

/** Create the three standard rounds in one shot if they don't exist. */
export async function bootstrapRoundsAction() {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();

  const courseId = await defaultCourseId(supabase, trip.id);

  const formats: { day: number; format: "scramble" | "best_ball_bonus" | "singles" }[] = [
    { day: 1, format: "scramble" },
    { day: 2, format: "best_ball_bonus" },
    { day: 3, format: "singles" },
  ];

  for (const f of formats) {
    const { data: existing } = await supabase
      .from("rounds")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("day_number", f.day)
      .maybeSingle();
    if (!existing) {
      await supabase.from("rounds").insert({
        trip_id: trip.id,
        day_number: f.day,
        format: f.format,
        course_id: courseId,
      });
    }
  }

  revalidatePath("/admin/rounds");
}

/** Casual trips: add one round at a time with an explicit format. */
export async function createRoundAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const day = Number(formData.get("day_number") ?? 0);
  const format = String(formData.get("format") ?? "");
  const date = (String(formData.get("date") ?? "") || null) as string | null;
  const allowed = ["medal", "stableford", "skins", "count_birdies", "match_play", "group_scramble"];
  if (!Number.isInteger(day) || day < 1 || day > 14 || !allowed.includes(format)) return;

  const supabase = await createClient();
  const courseId = await defaultCourseId(supabase, trip.id);

  await supabase.from("rounds").insert({
    trip_id: trip.id,
    day_number: day,
    format,
    date,
    course_id: courseId,
  });
  revalidatePath("/admin/rounds");
}

export async function deleteRoundAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("rounds").delete().eq("id", id).eq("trip_id", trip.id);
  revalidatePath("/admin/rounds");
}

/**
 * Casual group scramble: a "group" is a match row with everyone in side_a and
 * an empty side_b. The group posts one ball as team_side 'A'.
 */
export async function createGroupAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const round_id = String(formData.get("round_id") ?? "");
  if (!round_id) return;
  const supabase = await createClient();

  const { data: round } = await supabase
    .from("rounds")
    .select("id, trip_id")
    .eq("id", round_id)
    .maybeSingle();
  if (!round || round.trip_id !== trip.id) return;

  const memberIds = formData.getAll("members").map(String).filter(Boolean);
  if (memberIds.length === 0) return;

  const { data: existing } = await supabase
    .from("matches")
    .select("match_number")
    .eq("round_id", round_id)
    .order("match_number", { ascending: false })
    .limit(1);
  const next = (existing?.[0]?.match_number ?? 0) + 1;

  await supabase.from("matches").insert({
    round_id,
    match_number: next,
    side_a: memberIds,
    side_b: [],
  });
  revalidatePath("/admin/rounds");
}

export async function updateRoundAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const date = (String(formData.get("date") ?? "") || null) as string | null;
  const points = Number(formData.get("points_per_match") ?? 1) || 1;
  const supabase = await createClient();

  // course_id: "" clears the assignment; any value must be a course on this trip.
  const rawCourse = String(formData.get("course_id") ?? "");
  let course_id: string | null = null;
  if (rawCourse) {
    const { data: c } = await supabase
      .from("courses")
      .select("id")
      .eq("id", rawCourse)
      .eq("trip_id", trip.id)
      .maybeSingle();
    course_id = c ? rawCourse : null;
  }

  await supabase
    .from("rounds")
    .update({ date, points_per_match: points, course_id })
    .eq("id", id)
    .eq("trip_id", trip.id);
  revalidatePath("/admin/rounds");
  revalidatePath("/admin/course");
}

/**
 * Create a match. side_a/side_b passed as comma-separated player UUIDs (the
 * UI builds these from per-side player selects). team_a_id/team_b_id are
 * optional — set them so future cup-points aggregation can map matches to
 * teams directly without re-looking up player rosters.
 */
export async function createMatchAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const round_id = String(formData.get("round_id") ?? "");
  if (!round_id) return;
  const supabase = await createClient();

  // Make sure the round belongs to this trip.
  const { data: round } = await supabase
    .from("rounds")
    .select("id, trip_id")
    .eq("id", round_id)
    .maybeSingle();
  if (!round || round.trip_id !== trip.id) return;

  const sideAIds = formData.getAll("side_a").map(String).filter(Boolean);
  const sideBIds = formData.getAll("side_b").map(String).filter(Boolean);
  const team_a_id = (String(formData.get("team_a_id") ?? "") || null) as string | null;
  const team_b_id = (String(formData.get("team_b_id") ?? "") || null) as string | null;
  if (sideAIds.length === 0 || sideBIds.length === 0) return;

  // Determine next match_number.
  const { data: existing } = await supabase
    .from("matches")
    .select("match_number")
    .eq("round_id", round_id)
    .order("match_number", { ascending: false })
    .limit(1);
  const next = (existing?.[0]?.match_number ?? 0) + 1;

  await supabase.from("matches").insert({
    round_id,
    match_number: next,
    side_a: sideAIds,
    side_b: sideBIds,
    team_a_id,
    team_b_id,
  });
  revalidatePath("/admin/rounds");
}

/**
 * Save the per-round tee + tee-time row for every player in one shot. Form
 * fields are `tee_<player_id>` and `time_<player_id>`. Empty values clear.
 */
export async function savePlayerRoundSettingsAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const round_id = String(formData.get("round_id") ?? "");
  if (!round_id) return;
  const supabase = await createClient();

  const { data: round } = await supabase
    .from("rounds")
    .select("trip_id")
    .eq("id", round_id)
    .maybeSingle();
  if (round?.trip_id !== trip.id) return;

  const { data: players } = await supabase
    .from("players")
    .select("id")
    .eq("trip_id", trip.id);
  if (!players) return;

  const rows = players
    .map((p) => {
      const tee = String(formData.get(`tee_${p.id}`) ?? "") || null;
      const time = String(formData.get(`time_${p.id}`) ?? "") || null;
      if (tee === null && time === null) return null;
      return { round_id, player_id: p.id as string, tee_id: tee, tee_time: time };
    })
    .filter((r): r is { round_id: string; player_id: string; tee_id: string | null; tee_time: string | null } => r !== null);

  if (rows.length > 0) {
    await supabase.from("player_round_settings").upsert(rows, { onConflict: "round_id,player_id" });
  }
  revalidatePath("/admin/rounds");
}

export async function deleteMatchAction(formData: FormData) {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  // Validate via round.trip_id.
  const { data: row } = await supabase
    .from("matches")
    .select("round_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;
  const { data: round } = await supabase
    .from("rounds")
    .select("trip_id")
    .eq("id", row.round_id)
    .maybeSingle();
  if (round?.trip_id !== trip.id) return;
  await supabase.from("matches").delete().eq("id", id);
  revalidatePath("/admin/rounds");
}
