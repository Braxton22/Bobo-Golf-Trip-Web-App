"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Realtime changes on the scores + matches tables for the given
 * trip. On any change, triggers `router.refresh()` so the server-rendered
 * leaderboard pulls fresh data. Within ~1s per the spec.
 *
 * Keep this lightweight — we deliberately re-fetch the page rather than mutate
 * client state, since the leaderboard re-derivation is non-trivial and the
 * server-rendered version is the source of truth.
 */
export function RealtimeRefresh({ tripId, roundIds }: { tripId: string; roundIds: string[] }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel(`trip:${tripId}`)
      // Scores → leaderboard
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, (payload) => {
        const newRow = payload.new as { round_id?: string } | undefined;
        const oldRow = payload.old as { round_id?: string } | undefined;
        const rid = newRow?.round_id ?? oldRow?.round_id;
        if (!rid || roundIds.includes(rid)) refresh();
      })
      // Matches → cup standings
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => refresh())
      // Bets / activity — not strictly needed here but cheap to listen on
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, () => refresh())
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, tripId, roundIds.join(",")]);

  return null;
}
