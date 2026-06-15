"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Camera,
  ClipboardList,
  DollarSign,
  Flag,
  Info,
  LogIn,
  LogOut,
  Menu,
  Newspaper,
  Settings,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

type SiteHeaderProps = {
  isSignedIn: boolean;
  isAdmin?: boolean;
  signOut: () => void | Promise<void>;
};

type NavItem = { href: string; label: string; Icon: typeof Flag };

const PRIMARY: NavItem[] = [
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/scorecard",   label: "Scorecard",   Icon: ClipboardList },
  { href: "/bets",        label: "Bets",        Icon: DollarSign },
  { href: "/feed",        label: "Feed",        Icon: Newspaper },
  { href: "/info",        label: "Info",        Icon: Info },
];

const SECONDARY: NavItem[] = [
  { href: "/format", label: "How it works", Icon: BookOpen },
  { href: "/photos", label: "Photos",       Icon: Camera },
];

export function SiteHeader({ isSignedIn, isAdmin = false, signOut }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => setOpen(false), [pathname]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Flag className="h-3.5 w-3.5" />
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight">
              Bobo Golf Trip
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="tap rounded-full border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? <Menu className="h-5 w-5 rotate-90 transition-transform" /> : <Menu className="h-5 w-5 transition-transform" />}
            </button>
          </div>
        </div>
      </header>

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!open}
      >
        {/* Scrim */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Panel */}
        <nav
          className={cn(
            "absolute inset-x-0 top-0 max-h-[88vh] overflow-y-auto rounded-b-2xl border-b border-border bg-card shadow-lift transition-transform",
            open ? "translate-y-0" : "-translate-y-full"
          )}
          style={{ paddingTop: "var(--safe-top)" }}
          aria-label="Primary"
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
            <span className="font-serif text-lg font-semibold tracking-tight">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="tap rounded-full border border-border bg-background text-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mx-auto max-w-3xl px-4 pb-6 sm:px-6">
            {isSignedIn ? (
              <>
                <ul className="space-y-1">
                  {PRIMARY.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item.href)} />
                  ))}
                </ul>

                <div className="mt-4 border-t border-border pt-4">
                  <p className="label">More</p>
                  <ul className="space-y-1">
                    {SECONDARY.map((item) => (
                      <NavLink key={item.href} item={item} active={isActive(item.href)} />
                    ))}
                    {isAdmin && (
                      <NavLink
                        item={{ href: "/admin", label: "Admin", Icon: Settings }}
                        active={isActive("/admin")}
                      />
                    )}
                  </ul>
                </div>

                <form action={signOut} className="mt-5">
                  <button type="submit" className="btn-ghost w-full inline-flex items-center justify-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <ul className="space-y-1">
                <NavLink
                  item={{ href: "/format", label: "How it works", Icon: BookOpen }}
                  active={isActive("/format")}
                />
                <li>
                  <Link
                    href="/login"
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <LogIn className="h-4 w-4" />
                    </span>
                    Sign in
                  </Link>
                </li>
              </ul>
            )}
          </div>
        </nav>
      </div>
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { href, label, Icon } = item;
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
          active
            ? "bg-primary/15 text-primary"
            : "text-foreground hover:bg-muted"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </Link>
    </li>
  );
}
