"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { roundHasStarted } from "@/lib/round-status";
import type { PotType } from "@/lib/db";

function toNum(v: FormDataEntryValue | null, fallback: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function currentPlayerOnTrip(): Promise<{
  player_id: string;
  user_id: string;
  trip_id: string;
} | null> {
  const trip = await getActiveTrip();
  if (!trip) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!player) return null;
  return { player_id: player.id as string, user_id: user.id, trip_id: trip.id };
}

// ---------------------------------------------------------------------------
// Match bets
// ---------------------------------------------------------------------------

/** Place a bet on a match in advance. The placer picks a side; another
 *  player can take the other side later. */
export async function placeMatchBetAction(formData: FormData) {
  const ctx = await currentPlayerOnTrip();
  if (!ctx) return;
  const supabase = await createClient();

  const match_id = String(formData.get("match_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const amount = toNum(formData.get("amount"), 0);
  if (!match_id || (side !== "A" && side !== "B") || amount <= 0) return;

  // Validate: match belongs to this trip, and round hasn't started.
  const { data: match } = await supabase
    .from("matches")
    .select("id, side_a, side_b, round_id")
    .eq("id", match_id)
    .maybeSingle();
  if (!match) return;
  const { data: round } = await supabase
    .from("rounds")
    .select("id, trip_id")
    .eq("id", match.round_id)
    .maybeSingle();
  if (!round || round.trip_id !== ctx.trip_id) return;

  // No betting after the round has started.
  if (await roundHasStarted(round.id)) return;

  // You can't back your own opponent: if you're playing in this match on the
  // opposite side from `side`, refuse.
  const onA = (match.side_a as string[]).includes(ctx.player_id);
  const onB = (match.side_b as string[]).includes(ctx.player_id);
  if (onA && side === "B") return;
  if (onB && side === "A") return;

  const { data: inserted } = await supabase
    .from("match_bets")
    .insert({
      trip_id: ctx.trip_id,
      match_id,
      placer_player_id: ctx.player_id,
      side,
      amount,
    })
    .select("id")
    .single();
  if (!inserted) return;

  await supabase.from("activity_events").insert({
    trip_id: ctx.trip_id,
    round_id: round.id,
    type: "match_bet_placed",
    payload: { match_bet_id: inserted.id, match_id, side, amount },
  });

  revalidatePath("/bets");
  revalidatePath("/feed");
}

/** Take an open match bet — claim the opposite side. */
export async function takeMatchBetAction(formData: FormData) {
  const ctx = await currentPlayerOnTrip();
  if (!ctx) return;
  const supabase = await createClient();

  const bet_id = String(formData.get("bet_id") ?? "");
  if (!bet_id) return;

  const { data: bet } = await supabase
    .from("match_bets")
    .select("id, trip_id, match_id, placer_player_id, taker_player_id, side")
    .eq("id", bet_id)
    .maybeSingle();
  if (!bet || bet.trip_id !== ctx.trip_id) return;
  if (bet.taker_player_id) return; // already taken
  if (bet.placer_player_id === ctx.player_id) return;

  const { data: match } = await supabase
    .from("matches")
    .select("side_a, side_b, round_id")
    .eq("id", bet.match_id)
    .maybeSingle();
  if (!match) return;
  if (await roundHasStarted(match.round_id)) return;

  // Taker is backing the OPPOSITE side; reject if they're playing on the
  // placer's side (would be backing their own opponent).
  const onA = (match.side_a as string[]).includes(ctx.player_id);
  const onB = (match.side_b as string[]).includes(ctx.player_id);
  if (bet.side === "A" && onA) return;
  if (bet.side === "B" && onB) return;

  await supabase
    .from("match_bets")
    .update({ taker_player_id: ctx.player_id, taken_at: new Date().toISOString() })
    .eq("id", bet_id);

  await supabase.from("activity_events").insert({
    trip_id: ctx.trip_id,
    round_id: match.round_id,
    type: "match_bet_taken",
    payload: { match_bet_id: bet_id },
  });

  revalidatePath("/bets");
  revalidatePath("/feed");
}

/** Cancel an open, untaken bet — only the placer can. */
export async function cancelMatchBetAction(formData: FormData) {
  const ctx = await currentPlayerOnTrip();
  if (!ctx) return;
  const supabase = await createClient();

  const bet_id = String(formData.get("bet_id") ?? "");
  if (!bet_id) return;

  const { data: bet } = await supabase
    .from("match_bets")
    .select("trip_id, placer_player_id, taker_player_id")
    .eq("id", bet_id)
    .maybeSingle();
  if (!bet || bet.trip_id !== ctx.trip_id) return;
  if (bet.placer_player_id !== ctx.player_id) return;
  if (bet.taker_player_id) return;

  await supabase
    .from("match_bets")
    .update({ outcome: "cancelled", settled_at: new Date().toISOString() })
    .eq("id", bet_id);
  revalidatePath("/bets");
}

// ---------------------------------------------------------------------------
// Round pots
// ---------------------------------------------------------------------------

const VALID_POT: PotType[] = ["skins", "deuces", "low_net"];

/** Toggle the current player's opt-in for a round pot. Locked once any
 *  score has been posted on the round. */
export async function togglePotEntryAction(formData: FormData) {
  const ctx = await currentPlayerOnTrip();
  if (!ctx) return;
  const supabase = await createClient();

  const round_id = String(formData.get("round_id") ?? "");
  const pot_type = String(formData.get("pot_type") ?? "") as PotType;
  if (!round_id || !VALID_POT.includes(pot_type)) return;

  // Round must belong to this trip and must not have started.
  const { data: round } = await supabase
    .from("rounds")
    .select("id, trip_id")
    .eq("id", round_id)
    .maybeSingle();
  if (!round || round.trip_id !== ctx.trip_id) return;
  if (await roundHasStarted(round.id)) return;

  const { data: existing } = await supabase
    .from("round_pot_entries")
    .select("player_id")
    .eq("round_id", round_id)
    .eq("pot_type", pot_type)
    .eq("player_id", ctx.player_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("round_pot_entries")
      .delete()
      .eq("round_id", round_id)
      .eq("pot_type", pot_type)
      .eq("player_id", ctx.player_id);
  } else {
    await supabase.from("round_pot_entries").insert({
      round_id,
      pot_type,
      player_id: ctx.player_id,
    });
  }
  revalidatePath("/bets");
}
