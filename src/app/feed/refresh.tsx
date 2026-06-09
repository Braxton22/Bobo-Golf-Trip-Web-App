"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Activity-feed live refresh. Listens for inserts on activity_events as well
 * as score/bet writes (since we derive some feed items from them) and triggers
 * router.refresh() with a small debounce.
 */
export function FeedRefresh({ tripId }: { tripId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel(`feed:${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, refresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, tripId]);

  return null;
}
