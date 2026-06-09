"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, ClipboardList, DollarSign, Newspaper, Info, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  Icon: typeof Trophy;
  adminOnly?: boolean;
};

const TABS: Tab[] = [
  { href: "/leaderboard", label: "Board", Icon: Trophy },
  { href: "/scorecard",   label: "Scorecard", Icon: ClipboardList },
  { href: "/bets",        label: "Bets", Icon: DollarSign },
  { href: "/feed",        label: "Feed", Icon: Newspaper },
  { href: "/info",        label: "Info", Icon: Info },
  { href: "/admin",       label: "Admin", Icon: Settings, adminOnly: true },
];

type Props = { isSignedIn: boolean; isAdmin: boolean };

export function BottomTabBar({ isSignedIn, isAdmin }: Props) {
  const pathname = usePathname();
  if (!isSignedIn) return null;

  const tabs = TABS.filter((t) => (t.adminOnly ? isAdmin : true));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-safe"
    >
      <ul
        className="mx-auto grid max-w-3xl"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-2 tap text-[11px] font-medium leading-none transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("h-5 w-5 transition-transform", active && "scale-110")}
                  aria-hidden
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className="mt-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
