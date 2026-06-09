"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { registerPhotoAction } from "./actions";

type Props = { tripId: string };

export function PhotoUploader({ tripId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  async function uploadOne(file: File) {
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${tripId}/${safe}`;
    const { error: upErr } = await supabase.storage
      .from("trip-photos")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
    if (upErr) throw upErr;
    const fd = new FormData();
    fd.set("storage_path", path);
    fd.set("caption", caption);
    await registerPhotoAction(fd);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadOne(files[i]);
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      setCaption("");
      startTransition(() => {
        // Server action revalidates /photos.
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(0);
    }
  }

  return (
    <div className="card space-y-2">
      <label className="label">Add photos</label>
      <input
        className="input"
        placeholder="Optional caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <button
        type="button"
        className="btn w-full inline-flex items-center justify-center gap-1.5"
        onClick={() => fileRef.current?.click()}
        disabled={isPending || progress > 0}
      >
        {progress > 0 ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading… {progress}%
          </>
        ) : (
          <>
            <ImagePlus className="h-4 w-4" />
            Choose photos
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onPick}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
