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

/** Create the three standard rounds in one shot if they don't exist. */
export async function bootstrapRoundsAction() {
  const trip = await requireActiveAdmin();
  if (!trip) return;
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("trip_id", trip.id)
    .maybeSingle();

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
        course_id: course?.id ?? null,
      });
    }
  }

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
  await supabase
    .from("rounds")
    .update({ date, points_per_match: points })
    .eq("id", id)
    .eq("trip_id", trip.id);
  revalidatePath("/admin/rounds");
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
