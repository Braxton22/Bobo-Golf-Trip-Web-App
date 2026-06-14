"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Top-of-page "Back to homepage" pill, present on every route except the
 *  homepage itself. Renders inline at the top-left of the main column. */
export function BackToHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <Link
      href="/"
      className="-ml-1 mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to homepage
    </Link>
  );
}
