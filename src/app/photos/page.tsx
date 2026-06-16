import { redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Photo } from "@/lib/db";
import { PhotoUploader } from "./uploader";
import { PhotoGallery, type PhotoItem } from "./gallery";

export default async function PhotosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/photos");

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <Camera className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
      </div>
    );
  }

  const { data: photosRaw } = await supabase
    .from("photos")
    .select("*")
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false });
  const photos = (photosRaw ?? []) as Photo[];

  // Sign URLs for each photo (private bucket).
  const items: PhotoItem[] = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from("trip-photos")
        .createSignedUrl(p.storage_path, 60 * 60);
      return {
        id: p.id,
        url: data?.signedUrl ?? null,
        caption: p.caption,
        uploaded_by: p.uploaded_by,
        created_at: p.created_at,
        storage_path: p.storage_path,
      };
    })
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Photos</h1>
        <p className="text-sm text-muted-foreground">{trip.name}</p>
      </header>

      <PhotoUploader tripId={trip.id} />

      <PhotoGallery items={items} myUserId={user.id} tripName={trip.name} />
    </div>
  );
}
