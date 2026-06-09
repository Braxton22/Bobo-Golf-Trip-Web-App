"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";

/**
 * Records a photo upload that already happened client-side. The client uploads
 * directly to Supabase Storage (RLS enforces that the path's first segment
 * matches a trip the user belongs to), then calls this action to insert the
 * metadata row.
 */
export async function registerPhotoAction(formData: FormData) {
  const trip = await getActiveTrip();
  if (!trip) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const storage_path = String(formData.get("storage_path") ?? "");
  const caption = (String(formData.get("caption") ?? "").trim() || null) as string | null;
  if (!storage_path) return;
  if (!storage_path.startsWith(`${trip.id}/`)) return; // must live under this trip

  await supabase.from("photos").insert({
    trip_id: trip.id,
    uploaded_by: user.id,
    storage_path,
    caption,
  });
  revalidatePath("/photos");
}

export async function deletePhotoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("photos")
    .select("trip_id, storage_path, uploaded_by")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;
  await supabase.storage.from("trip-photos").remove([row.storage_path]);
  await supabase.from("photos").delete().eq("id", id);
  revalidatePath("/photos");
}
