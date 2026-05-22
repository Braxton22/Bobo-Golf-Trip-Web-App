"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function num(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createTrip(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      name: str(formData.get("name")) ?? "Untitled Trip",
      location: str(formData.get("location")),
      starts_on: str(formData.get("starts_on")),
      ends_on: str(formData.get("ends_on")),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !trip) throw new Error(error?.message ?? "create failed");

  await supabase.from("trip_members").insert({
    trip_id: trip.id,
    profile_id: user.id,
    role: "organizer",
  });

  revalidatePath("/trips");
  redirect(`/trips/${trip.id}`);
}

export async function joinTrip(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const tripId = str(formData.get("trip_id"));
  if (!tripId) return;
  await supabase.from("trip_members").insert({ trip_id: tripId, profile_id: user.id });
  revalidatePath(`/trips/${tripId}`);
}

export async function addRound(formData: FormData) {
  const supabase = await createClient();
  const tripId = str(formData.get("trip_id"));
  if (!tripId) return;
  await supabase.from("rounds").insert({
    trip_id: tripId,
    course_name: str(formData.get("course_name")) ?? "Untitled Course",
    played_on: str(formData.get("played_on")) ?? new Date().toISOString().slice(0, 10),
    par: num(formData.get("par")),
    notes: str(formData.get("notes")),
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function addAirbnb(formData: FormData) {
  const supabase = await createClient();
  const tripId = str(formData.get("trip_id"));
  if (!tripId) return;
  await supabase.from("airbnbs").insert({
    trip_id: tripId,
    name: str(formData.get("name")) ?? "Stay",
    address: str(formData.get("address")),
    url: str(formData.get("url")),
    check_in: str(formData.get("check_in")),
    check_out: str(formData.get("check_out")),
    total_cost: num(formData.get("total_cost")),
    notes: str(formData.get("notes")),
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function addBet(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const tripId = str(formData.get("trip_id"));
  if (!tripId) return;
  await supabase.from("bets").insert({
    trip_id: tripId,
    round_id: str(formData.get("round_id")),
    description: str(formData.get("description")) ?? "Side bet",
    amount: num(formData.get("amount")) ?? 0,
    proposed_by: user.id,
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/bets`);
}

export async function settleBet(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData.get("bet_id"));
  const winner = str(formData.get("winner_id"));
  const tripId = str(formData.get("trip_id"));
  if (!id) return;
  await supabase.from("bets").update({ status: "settled", winner_id: winner }).eq("id", id);
  if (tripId) revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/bets`);
}

export async function cancelBet(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData.get("bet_id"));
  const tripId = str(formData.get("trip_id"));
  if (!id) return;
  await supabase.from("bets").update({ status: "cancelled" }).eq("id", id);
  if (tripId) revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/bets`);
}

export async function setHandicap(formData: FormData) {
  const supabase = await createClient();
  const tripId = str(formData.get("trip_id"));
  const profileId = str(formData.get("profile_id"));
  if (!tripId || !profileId) return;
  await supabase
    .from("trip_members")
    .update({ handicap: num(formData.get("handicap")) })
    .eq("trip_id", tripId)
    .eq("profile_id", profileId);
  revalidatePath(`/trips/${tripId}`);
}

export async function saveScore(formData: FormData) {
  const supabase = await createClient();
  const roundId = str(formData.get("round_id"));
  const profileId = str(formData.get("profile_id"));
  const total = num(formData.get("total_strokes"));
  const tripId = str(formData.get("trip_id"));
  if (!roundId || !profileId || total == null) return;
  await supabase
    .from("scores")
    .upsert(
      { round_id: roundId, profile_id: profileId, total_strokes: total },
      { onConflict: "round_id,profile_id" }
    );
  if (tripId) revalidatePath(`/trips/${tripId}`);
}
