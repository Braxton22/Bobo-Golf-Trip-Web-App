import { redirect } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Photo } from "@/lib/db";
import { PhotoUploader } from "./uploader";
import { deletePhotoAction } from "./actions";

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
  const items = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from("trip-photos")
        .createSignedUrl(p.storage_path, 60 * 60);
      return { photo: p, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Photos</h1>
        <p className="text-sm text-muted-foreground">{trip.name}</p>
      </header>

      <PhotoUploader tripId={trip.id} />

      {items.length === 0 ? (
        <p className="card text-sm text-muted-foreground">
          No photos yet — be the first.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map(({ photo, url }) => (
            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-card">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={photo.caption ?? "Trip photo"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Loading
                </div>
              )}
              {photo.caption && (
                <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-[11px] text-white">
                  {photo.caption}
                </span>
              )}
              {photo.uploaded_by === user.id && (
                <form action={deletePhotoAction} className="absolute right-1.5 top-1.5">
                  <input type="hidden" name="id" value={photo.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-card/80 p-1.5 text-muted-foreground backdrop-blur hover:text-destructive"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
