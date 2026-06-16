"use client";

// Client-side photo grid with multi-select + native-save. Selection mode is
// toggled from a top button; tapping a photo while in select mode toggles
// its selection. The Save button uses the Web Share API with files when
// available — on iOS this opens the share sheet, which includes "Save N
// Images" that drops them straight into the Photos app. On browsers without
// share-files support (e.g. desktop Chrome/Firefox) we fall back to
// triggering one download per file. No zip.

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, Share2, Trash2, X } from "lucide-react";
import { deletePhotoAction } from "./actions";

export type PhotoItem = {
  id: string;
  url: string | null;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
  storage_path: string;
};

export function PhotoGallery({ items, myUserId }: { items: PhotoItem[]; myUserId: string }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareSupported, setShareSupported] = useState(false);

  // Detect whether the browser can share files (iOS Safari ≥ 15 / Android
  // Chrome / Safari macOS). We probe with an empty filename to avoid actually
  // reading any file; navigator.canShare returns true if the OS is willing.
  useEffect(() => {
    try {
      const probe = new File([new Blob([""], { type: "image/jpeg" })], "probe.jpg", {
        type: "image/jpeg",
      });
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[] }) => Promise<void>;
      };
      setShareSupported(
        typeof nav.share === "function" && !!nav.canShare?.({ files: [probe] })
      );
    } catch {
      setShareSupported(false);
    }
  }, []);

  const allIds = useMemo(() => items.filter((i) => i.url).map((i) => i.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(allIds));
  }
  function clear() {
    setSelected(new Set());
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setError(null);
  }

  async function save() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    const picks = items.filter((i) => selected.has(i.id) && i.url);
    setProgress({ done: 0, total: picks.length });

    try {
      // Fetch each photo as a File.
      const files: File[] = [];
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        try {
          const blob = await fetchBlob(p.url!);
          files.push(
            new File([blob], filenameFor(p, blob.type), { type: blob.type || "image/jpeg" })
          );
        } catch {
          // skip a single bad URL; keep the rest
        }
        setProgress({ done: i + 1, total: picks.length });
      }
      if (files.length === 0) throw new Error("Couldn't fetch any photos.");

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[] }) => Promise<void>;
      };
      const canShareThese =
        typeof nav.share === "function" && !!nav.canShare?.({ files });

      if (canShareThese) {
        // iOS: opens the share sheet → "Save N Images" saves to Photos.
        try {
          await nav.share!({ files });
          clear();
          return;
        } catch (err) {
          // Treat user cancellation as a soft exit; only fall through on
          // real errors.
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      // Fallback for desktop / unsupported browsers: trigger one download per
      // file. iOS Safari ignores `download` on cross-origin links, so the
      // share path is what matters there.
      for (const f of files) {
        triggerDownload(f, f.name);
        // Brief gap so browsers don't dedupe rapid clicks.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
      }
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="card text-sm text-muted-foreground">
        No photos yet — be the first.
      </p>
    );
  }

  const saveLabel =
    selected.size === 1
      ? shareSupported
        ? "Save to Photos"
        : "Download"
      : shareSupported
        ? `Save ${selected.size} to Photos`
        : `Download (${selected.size})`;

  return (
    <div className="space-y-3">
      {/* Selection toolbar */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {selectMode
            ? `${selected.size} selected`
            : `${items.length} photo${items.length === 1 ? "" : "s"}`}
        </span>
        {selectMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={allSelected ? clear : selectAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
            <button
              type="button"
              onClick={exitSelect}
              className="btn-ghost inline-flex items-center gap-1 text-xs"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="btn-ghost inline-flex items-center gap-1.5 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Select
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((p) => {
          const isSelected = selected.has(p.id);
          return (
            <li
              key={p.id}
              className={`relative aspect-square overflow-hidden rounded-2xl border bg-card transition ${
                isSelected ? "border-primary ring-2 ring-primary" : "border-line"
              }`}
            >
              {p.url ? (
                selectMode ? (
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="block h-full w-full focus:outline-none"
                    aria-pressed={isSelected}
                    aria-label={isSelected ? "Deselect photo" : "Select photo"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "Trip photo"}
                      loading="lazy"
                      className={`h-full w-full object-cover transition ${
                        isSelected ? "opacity-80" : ""
                      }`}
                    />
                  </button>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.url}
                    alt={p.caption ?? "Trip photo"}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Loading
                </div>
              )}

              {/* Selection check */}
              {selectMode && (
                <span
                  className={`pointer-events-none absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shadow-soft ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/70 text-foreground"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
              )}

              {p.caption && !selectMode && (
                <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-[11px] text-white">
                  {p.caption}
                </span>
              )}
              {p.uploaded_by === myUserId && !selectMode && (
                <form action={deletePhotoAction} className="absolute right-1.5 top-1.5">
                  <input type="hidden" name="id" value={p.id} />
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
          );
        })}
      </ul>

      {/* Sticky save action bar */}
      {selectMode && selected.size > 0 && (
        <div
          className="sticky bottom-3 z-30 flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-lift"
          style={{ bottom: "calc(0.75rem + var(--safe-bottom))" }}
        >
          <span className="px-1 text-sm">
            {progress
              ? `Preparing ${progress.done}/${progress.total}…`
              : `${selected.size} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={clear} disabled={busy} className="btn-ghost text-xs">
              Clear
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn inline-flex items-center gap-1.5 text-sm disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : shareSupported ? (
                <Share2 className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {saveLabel}
            </button>
          </div>
        </div>
      )}

      {selectMode && shareSupported && (
        <p className="text-[11px] text-muted-foreground">
          Tap{" "}
          <strong>Save {selected.size > 1 ? `${selected.size} Images` : "Image"}</strong>{" "}
          in your share sheet to drop them into Photos. Works on iPhone (any browser)
          and Android.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

function filenameFor(p: PhotoItem, mime?: string): string {
  // Prefer the storage path's extension; fall back to the mime type.
  let ext = p.storage_path.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "";
  if (!ext && mime) {
    if (mime === "image/jpeg") ext = ".jpg";
    else if (mime === "image/png") ext = ".png";
    else if (mime === "image/heic") ext = ".heic";
    else if (mime === "image/webp") ext = ".webp";
    else ext = ".jpg";
  }
  if (!ext) ext = ".jpg";
  const date = p.created_at.slice(0, 10);
  const captionSlug = p.caption ? "-" + slug(p.caption).slice(0, 40) : "";
  return `${date}${captionSlug}-${p.id.slice(0, 6)}${ext}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
