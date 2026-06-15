"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Lightweight theme toggle. Dark is the default; clicking toggles `light` on
 * <html> and persists the choice in localStorage. The matching pre-paint
 * script (ThemePrepaintScript below) runs in the document head so there's no
 * flash of the wrong theme on load.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const flip = () => {
    const next: "light" | "dark" = theme === "light" ? "dark" : "light";
    setTheme(next);
    const html = document.documentElement;
    html.classList.toggle("light", next === "light");
    html.style.colorScheme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode etc — ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Dark mode" : "Light mode"}
      className="tap rounded-full border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}

/**
 * Inline <script> that runs before paint to apply the persisted theme so the
 * page never flashes. Rendered from the server layout's <head>.
 */
export function ThemePrepaintScript() {
  const code = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.add('light');document.documentElement.style.colorScheme='light';}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
