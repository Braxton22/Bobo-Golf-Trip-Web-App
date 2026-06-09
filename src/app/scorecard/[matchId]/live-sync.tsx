"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to score writes for THIS match and triggers router.refresh() so
 * the read-only opposing column on the scorecard reflects opponent scores as
 * they're posted. Local writes are already optimistic via the offline queue;
 * this only fires for changes that originated elsewhere.
 *
 * Note: we can't easily filter to "rows where match_id = X" via Supabase
 * realtime when joining additional logic. Listening to all score writes is
 * cheap during a single match and the debounce keeps refreshes manageable.
 */
export function MatchLiveSync({ matchId }: { matchId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };

    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores", filter: `match_id=eq.${matchId}` },
        refresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, matchId]);

  return null;
}
