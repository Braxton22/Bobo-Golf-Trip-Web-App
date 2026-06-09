"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";

function toNum(v: FormDataEntryValue | null, fallback: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const VALID_TYPES = new Set([
  "match",
  "longest_drive",
  "closest_to_pin",
  "hole_score",
  "low_net_round",
  "skins",
  "other",
]);

export async function createBetAction(formData: FormData) {
  const trip = await getActiveTrip();
  if (!trip) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bets/new");

  const type = String(formData.get("type") ?? "other");
  if (!VALID_TYPES.has(type)) return;
  const amount = toNum(formData.get("amount"), 0);
  if (amount <= 0) return;
  const description = (String(formData.get("description") ?? "").trim() || null) as string | null;
  const hole_raw = String(formData.get("hole_number") ?? "");
  const hole_number = hole_raw === "" ? null : Math.max(1, Math.min(18, Number(hole_raw)));
  const round_id = (String(formData.get("round_id") ?? "") || null) as string | null;
  const participantIds = formData.getAll("participant_ids").map(String).filter(Boolean);

  if (participantIds.length < 2) return;

  const { data: inserted } = await supabase
    .from("bets")
    .insert({
      trip_id: trip.id,
      round_id,
      type,
      hole_number,
      amount,
      description,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (!inserted) return;

  await supabase.from("bet_participants").insert(
    participantIds.map((player_id) => ({ bet_id: inserted.id, player_id }))
  );

  // Activity event for the feed.
  await supabase.from("activity_events").insert({
    trip_id: trip.id,
    round_id,
    type: "bet_created",
    payload: { bet_id: inserted.id, amount, description, kind: type },
  });

  revalidatePath("/bets");
  revalidatePath("/feed");
  redirect(`/bets/${inserted.id}`);
}

export async function settleBetAction(formData: FormData) {
  const trip = await getActiveTrip();
  if (!trip) return;
  const bet_id = String(formData.get("bet_id") ?? "");
  if (!bet_id) return;
  const winnerIds = formData.getAll("winner_ids").map(String).filter(Boolean);

  const supabase = await createClient();
  // Reset all participants for this bet to non-winners, then mark the chosen.
  await supabase.from("bet_participants").update({ is_winner: false }).eq("bet_id", bet_id);
  if (winnerIds.length > 0) {
    await supabase
      .from("bet_participants")
      .update({ is_winner: true })
      .eq("bet_id", bet_id)
      .in("player_id", winnerIds);
  }
  await supabase
    .from("bets")
    .update({ status: "settled", settled_at: new Date().toISOString() })
    .eq("id", bet_id)
    .eq("trip_id", trip.id);

  await supabase.from("activity_events").insert({
    trip_id: trip.id,
    type: "bet_settled",
    payload: { bet_id, winners: winnerIds },
  });

  revalidatePath("/bets");
  revalidatePath(`/bets/${bet_id}`);
  revalidatePath("/bets/settle-up");
  revalidatePath("/feed");
}

export async function cancelBetAction(formData: FormData) {
  const trip = await getActiveTrip();
  if (!trip) return;
  const bet_id = String(formData.get("bet_id") ?? "");
  if (!bet_id) return;
  const supabase = await createClient();
  await supabase
    .from("bets")
    .update({ status: "cancelled" })
    .eq("id", bet_id)
    .eq("trip_id", trip.id);
  revalidatePath("/bets");
  revalidatePath(`/bets/${bet_id}`);
}

export async function reopenBetAction(formData: FormData) {
  const trip = await getActiveTrip();
  if (!trip) return;
  const bet_id = String(formData.get("bet_id") ?? "");
  if (!bet_id) return;
  const supabase = await createClient();
  await supabase
    .from("bets")
    .update({ status: "open", settled_at: null })
    .eq("id", bet_id)
    .eq("trip_id", trip.id);
  await supabase.from("bet_participants").update({ is_winner: false }).eq("bet_id", bet_id);
  revalidatePath("/bets");
  revalidatePath(`/bets/${bet_id}`);
  revalidatePath("/bets/settle-up");
}
