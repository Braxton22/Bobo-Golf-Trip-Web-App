import Link from "next/link";
import { Flag } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-card/50">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-10 text-center sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left">
        <Link href="/" className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          <span className="font-serif text-base font-semibold tracking-tight text-primary">
            Bobo Golf Trip
          </span>
        </Link>
        <p className="text-sm text-muted-foreground">
          Rounds, rentals, and side bets for the boys.
        </p>
        <p className="text-xs text-muted-foreground">
          &copy; {year} Bobo Golf Trip
        </p>
      </div>
    </footer>
  );
}
