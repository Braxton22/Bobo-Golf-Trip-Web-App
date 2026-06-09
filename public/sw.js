// Bobo Golf Trip — service worker
// Strategy:
//   - Cache the app shell so the PWA opens offline.
//   - Network-first for HTML/data; cache-first for hashed static assets.
//   - Score writes are queued in IndexedDB by the app, NOT in the SW; we just
//     fall back to the cached shell so the offline scorecard UI keeps running.

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

const SHELL_URLS = ["/", "/leaderboard", "/scorecard", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept Supabase Realtime / Auth / REST — let the app handle it.
  if (url.hostname.includes("supabase")) return;

  // Static Next assets — cache-first.
  if (url.pathname.startsWith("/_next/static/") || /\.(?:png|jpe?g|svg|webp|ico|woff2?|ttf|css|js)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        } catch {
          return cached ?? Response.error();
        }
      })
    );
    return;
  }

  // HTML / navigation requests — network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(req)) || (await cache.match("/"));
          return cached ?? Response.error();
        }
      })()
    );
  }
});
