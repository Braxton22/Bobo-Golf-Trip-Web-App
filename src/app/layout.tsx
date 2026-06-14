import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BackToHome } from "@/components/layout/back-to-home";
import { PWARegister } from "@/components/pwa-register";
import { isAppAdminEmail } from "@/lib/app-admin";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

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
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = isAppAdminEmail(user?.email);

  return (
    <html
      lang="en"
      className={`dark ${sans.variable} ${serif.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body>
        <div className="flex min-h-screen flex-col bg-background">
          <SiteHeader isSignedIn={!!user} isAdmin={isAdmin} signOut={signOut} />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
            <BackToHome />
            {children}
          </main>
          <SiteFooter />
        </div>
        <PWARegister />
      </body>
    </html>
  );
}
