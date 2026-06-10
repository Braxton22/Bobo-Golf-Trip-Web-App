"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, Menu, X, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  isSignedIn: boolean;
  isAdmin?: boolean;
  signOut: () => void | Promise<void>;
};

const BASE_NAV_LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/scorecard", label: "Scorecard" },
  { href: "/bets", label: "Bets" },
];

const ADMIN_LINK = { href: "/admin", label: "Admin" };

export function SiteHeader({ isSignedIn, isAdmin = false, signOut }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const NAV_LINKS = isAdmin ? [...BASE_NAV_LINKS, ADMIN_LINK] : BASE_NAV_LINKS;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          onClick={() => setMenuOpen(false)}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform group-hover:scale-105">
            <Flag className="h-4 w-4" />
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight text-primary">
            Bobo Golf Trip
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {isSignedIn && (
            <ul className="mr-2 flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive(link.href)
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {link.label}
                    <span
                      className={cn(
                        "absolute inset-x-3 -bottom-0.5 h-px origin-left bg-primary transition-transform duration-200",
                        isActive(link.href) ? "scale-x-100" : "scale-x-0"
                      )}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ThemeToggle />
          {isSignedIn ? (
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </form>
          ) : (
            <Link
              href="/login"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Sign in
            </Link>
          )}
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 sm:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="animate-fade-in border-t border-border bg-card/95 backdrop-blur sm:hidden">
          <nav className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-4">
            {isSignedIn ? (
              <>
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive(link.href)
                        ? "bg-muted text-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <form action={signOut} className="pt-1">
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full justify-center gap-1.5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </form>
              </>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                <Button className="w-full justify-center">Sign in</Button>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
