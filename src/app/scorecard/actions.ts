"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { allocateStrokes, courseHandicap } from "@/lib/scoring";
import type { Hole } from "@/lib/scoring/types";

type Input = {
  round_id: string;
  match_id: string | null; // null for solo-format rounds
  team_side: "A" | "B" | null;
  player_id: string | null;
  hole_number: number;
  gross: number;
};

/**
 * Upsert a single hole score. Manual upsert (no ON CONFLICT) because we use
 * partial unique indexes that PostgREST won't target. Last-write-wins per the
 * spec.
 *
 * Solo-format rounds (medal / stableford / skins / count-birdies) post with
 * match_id null and player_id set — covered by the scores_unique_solo index.
 *
 * Also computes `net` server-side so the round leaderboard can query it
 * directly without re-running the engine.
 */
export async function upsertScore(input: Input) {
  const supabase = await createClient();

  if (!input.round_id || !input.hole_number) {
    throw new Error("Missing identifiers");
  }
  if (!input.match_id && !input.player_id) {
    throw new Error("Solo scores need a player");
  }
  if (input.gross < 1 || input.gross > 15) {
    throw new Error("Invalid score");
  }

  // Compute net for the simple cases (player_id set). For team scramble
  // entries (player_id null) we don't have a single player handicap; leave net
  // null and let the read-time engine compute it.
  let net: number | null = null;
  if (input.player_id) {
    const [{ data: player }, { data: roundRow }] = await Promise.all([
      supabase
        .from("players")
        .select("handicap_index, trip_id")
        .eq("id", input.player_id)
        .maybeSingle(),
      supabase
        .from("rounds")
        .select("trip_id, course_id, format")
        .eq("id", input.round_id)
        .maybeSingle(),
    ]);

    if (player && roundRow?.course_id) {
      const { data: holesRaw } = await supabase
        .from("holes")
        .select("hole_number, par, stroke_index")
        .eq("course_id", roundRow.course_id);
      const holes = (holesRaw ?? []) as Hole[];
      if (holes.length > 0) {
        const ch = courseHandicap({ index: Number(player.handicap_index) }, { holes }, "simple");
        const strokes = allocateStrokes(ch, holes);
        const received = strokes.get(input.hole_number) ?? 0;
        net = input.gross - received;
      }
    }
  }

  // Existing row?
  let q = supabase
    .from("scores")
    .select("id")
    .eq("round_id", input.round_id)
    .eq("hole_number", input.hole_number);
  if (input.match_id) q = q.eq("match_id", input.match_id);
  else q = q.is("match_id", null);
  if (input.player_id) q = q.eq("player_id", input.player_id);
  else q = q.is("player_id", null).eq("team_side", input.team_side);

  const { data: existing } = await q.maybeSingle();

  if (existing) {
    await supabase
      .from("scores")
      .update({ gross: input.gross, net, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("scores").insert({
      round_id: input.round_id,
      match_id: input.match_id,
      team_side: input.team_side,
      player_id: input.player_id,
      hole_number: input.hole_number,
      gross: input.gross,
      net,
    });
  }

  // Don't revalidate paths here — the live leaderboard subscribes via
  // Realtime; revalidating would just thrash the cache on every hole entry.
  return { ok: true as const };
}

export async function deleteScore(input: {
  round_id: string;
  match_id: string | null;
  team_side: "A" | "B" | null;
  player_id: string | null;
  hole_number: number;
}) {
  const supabase = await createClient();
  let q = supabase
    .from("scores")
    .delete()
    .eq("round_id", input.round_id)
    .eq("hole_number", input.hole_number);
  if (input.match_id) q = q.eq("match_id", input.match_id);
  else q = q.is("match_id", null);
  if (input.player_id) q = q.eq("player_id", input.player_id);
  else q = q.is("player_id", null).eq("team_side", input.team_side);
  await q;
  revalidatePath("/scorecard");
  return { ok: true as const };
}
