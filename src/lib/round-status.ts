import { createClient } from "@/lib/supabase/server";

/**
 * "Has the round started?" — true the moment ANY score exists on it. Used to
 * lock pot opt-ins ("must be in before the first ball is hit").
 *
 * Caller is responsible for whatever permissions they need; this just checks
 * for existence.
 */
export async function roundHasStarted(roundId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("scores")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  return (count ?? 0) > 0;
}
