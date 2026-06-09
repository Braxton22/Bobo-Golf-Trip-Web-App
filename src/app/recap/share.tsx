"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

type Props = { title: string; text: string };

export function ShareRecap({ title, text }: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const payload = { title, text };
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share(payload);
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // No clipboard either — best-effort, do nothing.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="btn w-full inline-flex items-center justify-center gap-1.5"
    >
      <Share2 className="h-4 w-4" />
      {copied ? "Copied!" : "Share recap"}
    </button>
  );
}
