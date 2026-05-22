"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Subscribes to Supabase Realtime and refreshes server-rendered data when
// scores or per-trip handicaps change, so the leaderboard updates live.
export function RealtimeRefresher({ channel = "leaderboard" }: { channel?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let pending: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 250);
    };

    const sub = supabase
      .channel(`rt:${channel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, refresh)
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(sub);
    };
  }, [router, channel]);

  return null;
}
