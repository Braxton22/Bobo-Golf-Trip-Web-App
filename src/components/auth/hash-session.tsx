"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Handles the rare case where Supabase returns the session via the URL
 * fragment (#access_token=…&refresh_token=…) instead of a `?code=` query
 * param. The server can't see fragments, so without this the user would
 * land on whatever page received them — usually the home page — already
 * signed in on Supabase's side but with no cookies, looking logged out.
 *
 * On any page load we sniff location.hash. If it carries an access token,
 * we hand it to supabase-js, which writes the cookies, then we strip the
 * fragment and refresh so server components re-render with the session.
 */
export function HashSessionHandler() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;
    const supabase = createClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(() => {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        router.refresh();
      })
      .catch(() => undefined);
  }, [router]);
  return null;
}
