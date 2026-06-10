import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { PWARegister } from "@/components/pwa-register";
import { isAppAdminEmail } from "@/lib/app-admin";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Fraunces — modern serif with the right Augusta/leaderboard character.
const serif = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bobo Golf Trip",
  description: "Ryder Cup format scoring, bets, and feed for the boys' annual trip.",
  applicationName: "Bobo Golf Trip",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Bobo Golf",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF8F1" },
    { media: "(prefers-color-scheme: dark)",  color: "#0B3D2E" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Admin tab is only shown to the app-admin allowlist (ADMIN_EMAILS).
  // The /admin layout enforces the same check server-side.
  const isAdmin = isAppAdminEmail(user?.email);

  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <div className="flex min-h-screen flex-col bg-background pb-tabbar">
            <SiteHeader isSignedIn={!!user} isAdmin={isAdmin} signOut={signOut} />
            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
              {children}
            </main>
            <SiteFooter />
          </div>
          <BottomTabBar isSignedIn={!!user} isAdmin={isAdmin} />
          <PWARegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
