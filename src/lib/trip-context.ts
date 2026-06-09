// Active-trip selection. A user may belong to several trips; we keep the active
// one in a cookie so server components can scope queries. Falls back to the
// most recent non-archived trip the user belongs to.

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/lib/db";

export const ACTIVE_TRIP_COOKIE = "active_trip_id";

/** Sets the active trip cookie. Use from a server action. */
export async function setActiveTripCookie(tripId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_TRIP_COOKIE, tripId, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveTripCookie() {
  const jar = await cookies();
  jar.delete(ACTIVE_TRIP_COOKIE);
}

/**
 * Returns the active trip for the current user, or null if they have none.
 * Honors the cookie when valid; otherwise picks the most recent visible trip.
 */
export async function getActiveTrip(): Promise<Trip | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_TRIP_COOKIE)?.value;

  if (cookieId) {
    const { data } = await supabase.from("trips").select("*").eq("id", cookieId).maybeSingle();
    if (data) return data as Trip;
  }

  // Fall back to most-recent non-archived trip visible via RLS.
  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("archived", false)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as Trip | undefined) ?? null;
}

/**
 * True if the current user is an admin of the given trip (creator OR listed in
 * trip_admins). Server-side use only.
 */
export async function isTripAdmin(tripId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: trip } = await supabase
    .from("trips")
    .select("created_by")
    .eq("id", tripId)
    .maybeSingle();
  if (trip?.created_by === user.id) return true;

  const { data: row } = await supabase
    .from("trip_admins")
    .select("user_id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!row;
}

/** Cheap server-side check: is the user an admin of ANY trip? Used to gate the Admin tab. */
export async function isAnyTripAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const [{ data: created }, { data: admin }] = await Promise.all([
    supabase.from("trips").select("id").eq("created_by", user.id).limit(1),
    supabase.from("trip_admins").select("trip_id").eq("user_id", user.id).limit(1),
  ]);
  return (created?.length ?? 0) > 0 || (admin?.length ?? 0) > 0;
}

/** Random join code like MASTERS26 / DOGLEG48. Uppercase, no ambiguous chars. */
export function generateJoinCode(seedWord?: string): string {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  };
  if (seedWord) {
    const clean = seedWord.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return `${clean}${rand(2)}`;
  }
  return rand(6);
}
