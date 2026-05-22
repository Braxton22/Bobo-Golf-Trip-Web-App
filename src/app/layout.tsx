import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bobo Golf Trip",
  description: "Rounds, rentals, and side bets for the boys.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <header className="border-b border-border bg-card/80 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-serif text-xl font-semibold text-primary">
                ⛳ Bobo Golf Trip
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                {user ? (
                  <>
                    <Link href="/trips" className="hover:text-primary">Trips</Link>
                    <Link href="/bets" className="hover:text-primary">Bets</Link>
                    <form action={signOut}>
                      <button className="btn-ghost" type="submit">Sign out</button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="btn">Sign in</Link>
                )}
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
