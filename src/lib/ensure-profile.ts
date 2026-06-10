// Ensures the signed-in user has a public.profiles row. The row is normally
// created by the on-signup trigger, but users who signed up before a DB reset
// (or via an import) can be missing one — and several tables FK to profiles,
// so writes fail confusingly without it. Call this at the top of any action
// that inserts rows referencing profiles(id).

import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function ensureProfile(user: User): Promise<void> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return;

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Player";

  // RLS note: profiles has no INSERT policy for users (the trigger normally
  // owns creation), so this insert only succeeds because the row is the
  // caller's own id — add a self-insert policy at the DB level to match.
  await supabase.from("profiles").insert({
    id: user.id,
    display_name: displayName,
    email: user.email ?? null,
  });
}
