# Bobo Golf Trip

A mobile-first, Augusta-inspired PWA for our annual Ryder-Cup-style golf trip.
Two teams, three days, twelve points, 6½ wins the cup.

## What's in it

- **Live leaderboards** — net round board (red-for-under, classic Masters
  styling) plus the running Cup scoreline ("6½ – 5½"), updating within ~1s via
  Supabase Realtime.
- **Per-hole scoring** for the three day formats:
  - Day 1 — **Scramble** (2-man, team handicap diff allocated by SI)
  - Day 2 — **Best Ball + Bonus** (best net, with a −1 bonus when both
    partners make net par-or-better)
  - Day 3 — **Singles** (1v1, full handicap by SI)
- **Offline-tolerant score entry** — IndexedDB queue, per-row sync indicator,
  auto-flush on reconnect. Steppers with 44 px tap targets.
- **Bets** — match, longest drive, closest to pin, hole-score, low-net,
  skins, other. One-tap Venmo deep links and a **smart settle-up** view that
  greedily simplifies who-pays-whom into the fewest transfers.
- **Activity feed** — birdies, eagles, in-progress matches, decided matches,
  bets created/settled, all live via Realtime.
- **Trip info** — course (par + SI + per-tee yardages), lodging (address,
  code, WiFi), and a 3-day weather forecast (Open-Meteo, no key needed).
- **Photo gallery** — per-trip Supabase Storage bucket with signed URLs and
  RLS scoped by trip membership.
- **End-of-trip recap** — final scoreline, MVP, biggest bet winner, lowest
  net round, most birdies; share via the Web Share API.
- **PWA** — installable, themed splash, service worker shell cache.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS + custom HSL token layer (Augusta cream/green/gold)
- Supabase: Postgres + Auth (magic link) + Realtime + Storage
- Vercel hosting

## Setup (~10 minutes)

### 1. Create a Supabase project

1. <https://supabase.com> → **New project**.
2. Wait for it to provision (~1 min).
3. Copy `Project URL` and the anon public key from **Project Settings → API**.

### 2. Run the migrations

In the Supabase dashboard, open **SQL Editor → New query** and run the files
under `/supabase/migrations` **in order**:

1. `0001_init.sql`
2. `0002_premium.sql`
3. `0003_ryder_cup.sql` — **destructive**: drops the legacy v1 tables and
   builds the full Ryder Cup schema (trips, teams, courses/holes/tees/yardages,
   players, rounds, matches, per-hole scores, bets + participants,
   activity_events, photos, lodging). Includes RLS and Realtime publication.
4. `0004_photos_storage.sql` — creates the `trip-photos` Storage bucket and
   its RLS policies.

### 3. Configure auth redirect URLs

**Authentication → URL Configuration**:

- **Site URL**: your Vercel URL (e.g. `https://bobo-golf.vercel.app`)
- **Additional redirect URLs**: `http://localhost:3000/auth/callback` and your
  Vercel URL.

### 4. Local dev

```bash
cp .env.example .env.local      # fill in the Supabase values
npm install
npm run dev                     # http://localhost:3000
npm run test                    # 37 unit tests (scoring engine + venmo)
npm run build                   # production build
```

### 5. Deploy on Vercel

1. <https://vercel.com> → **Import Project** → pick this repo.
2. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_SITE_URL` (= your Vercel URL).
3. Deploy.

## How the trip flow works

1. **Admin** signs in, creates a trip at `/admin/trips`. A join code is
   generated, two starter teams ("Pine" and "Sand") are auto-seeded, and the
   trip becomes active.
2. **Admin** fills in the course at `/admin/course` (18 holes seed to a par-72
   layout you can tweak), adds tees + yardages, lodging, and rounds.
3. **Admin** opens `/admin/rounds`, taps "Bootstrap the 3 days", then sets
   dates and pairings (3 scramble pairs, 3 best-ball pairs, 6 singles).
4. **Players** sign in and visit `/join/<code>` to set their name, handicap
   index, tee, and Venmo username.
5. **During play** — `/scorecard` lists the matches each player is in;
   tapping one opens the per-hole stepper. Scores save instantly; offline
   entries queue and sync on reconnect.
6. **Live** — `/leaderboard` shows the Cup standings + per-day net board,
   updating in real time as scores roll in.
7. **Bets** — anyone can propose at `/bets/new`; settle them later; pay each
   other via Venmo deep links; end-of-trip settle-up at `/bets/settle-up`.
8. **Recap** — when the cup is decided, a link surfaces on the leaderboard
   pointing at `/recap` — MVP, biggest bet winner, lowest net round, share.

## Project map

```
src/
  app/
    layout.tsx                # root layout: header + bottom tabs + PWA register
    page.tsx                  # marketing landing (signed-out) → /leaderboard
    login/                    # magic-link sign in
    auth/callback/            # OAuth-style code exchange
    leaderboard/              # cup standings + day selector + net board
    scorecard/                # match list + per-hole entry (offline)
    bets/                     # bets list, new, detail (Venmo), settle-up
    feed/                     # live activity feed
    info/                     # course, lodging, weather
    photos/                   # gallery + uploader
    recap/                    # end-of-trip recap
    admin/                    # trips, teams, players, course, lodging, rounds
    join/[code]/              # player self-onboarding
  components/
    layout/                   # site header + bottom tab bar
    admin/                    # section/field/form primitives
    ...
  lib/
    scoring/                  # PURE: handicap, formats, match play, leaderboard
      __tests__/              # 28 unit tests including spec §6 worked examples
    score-queue.ts            # IndexedDB offline write queue
    venmo.ts                  # deep links + debt simplification
    __tests__/venmo.test.ts   # 9 unit tests
    trip-context.ts           # active-trip cookie + admin helpers
    weather.ts                # Open-Meteo fetcher (30-min revalidate)
    db.ts                     # hand-rolled row types
    supabase/                 # browser/server/middleware clients
supabase/migrations/
  0001_init.sql               # legacy schema (kept for ordering)
  0002_premium.sql            # legacy additions
  0003_ryder_cup.sql          # FULL Ryder Cup schema + RLS + Realtime
  0004_photos_storage.sql     # Storage bucket + policies
public/
  manifest.webmanifest        # PWA manifest
  sw.js                       # network-first HTML, cache-first assets
  icon.svg                    # placeholder icon (replace 192/512 PNGs for install)
```

## Scoring rules (the heart of the app)

All formulas live in `/src/lib/scoring`, are pure, and have unit tests.

**Handicap (simple mode, default):** `courseHandicap = round(HandicapIndex)`.
Strokes are allocated by stroke index: 1 stroke on every hole with `SI ≤ N`;
a 2nd stroke on holes with `SI ≤ N − 18` when `N > 18`.

**Scramble (Day 1):**

```
teamCH = round(0.35 * round(lowIdx) + 0.15 * round(highIdx))
diff = |teamA_CH − teamB_CH|
```

Lower team plays scratch; higher team receives `diff` strokes by SI. Team
enters one gross per hole; net per-hole drives match play.

**Best Ball + Bonus (Day 2):**

```
teamHoleScore = min(partnerA_net, partnerB_net)
if (partnerA_net ≤ par AND partnerB_net ≤ par) teamHoleScore −= 1
```

**Singles (Day 3):** each player receives full strokes by SI; compare net per
hole for match play.

**Match play:** each match is worth 1 point; win = 1, halve = 0.5/0.5,
loss = 0. Sum per team for Cup standings. 6.5 wins of 12 by default; ties
use the trip's `tie_outcome_label`.

## Notes

- The Venmo deep link spec is best-effort — amount prefill is unreliable on
  some clients, so the UI always shows the amount alongside the link.
- Storage bucket is private; URLs in the gallery are signed for 1 hour.
- Weather defers gracefully to "no forecast" when offline or Open-Meteo is
  unreachable.
- Icons are SVG-only by default; for full PWA install, drop
  `/public/icon-192.png` and `/public/icon-512.png` in place.
