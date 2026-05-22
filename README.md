# ⛳ Bobo Golf Trip Web App

A Next.js + Supabase app for the boys' annual golf trip. Built to deploy on
Vercel.

**Features**

- Magic-link sign-in (Supabase Auth)
- Trips with roster, dates, and location
- Rounds with per-player scoring + a per-trip leaderboard
- Airbnbs: name, address, dates, cost, listing URL, notes
- Side bets: propose, settle, cancel — across the whole trip or tied to a round
- Row-level security so only trip members see trip data

## Stack

- Next.js 15 (App Router) + React + TypeScript
- Tailwind CSS
- Supabase (Postgres + Auth) via `@supabase/ssr`
- Deployed on Vercel

---

## One-time setup (~10 minutes)

### 1. Create your Supabase project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Pick a name (e.g. `bobo-golf`), set a DB password, choose a region close to
   you.
3. Wait for it to provision (~1 min).

### 2. Run the SQL migration

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql).
3. Click **Run**. You should see `Success. No rows returned.`

This creates the `profiles`, `trips`, `trip_members`, `airbnbs`, `rounds`,
`scores`, and `bets` tables, plus row-level-security policies and a trigger
that creates a profile row on signup.

### 3. Grab your Supabase API keys

In the dashboard:

- **Project Settings → API**
  - `Project URL` → goes into `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` key → goes into `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Configure Auth redirect URLs

In the dashboard:

- **Authentication → URL Configuration**
  - Site URL: your Vercel URL once you have it, e.g.
    `https://bobo-golf.vercel.app`
  - Additional redirect URLs: add `http://localhost:3000/auth/callback` and
    `https://YOUR-VERCEL-URL/auth/callback`

(Email is enabled by default. Magic links work out of the box on the free tier.)

### 5. Push this repo to GitHub

```bash
git remote add origin git@github.com:YOUR-USERNAME/Bobo-Golf-Trip-Web-App.git
git push -u origin main
```

### 6. Deploy on Vercel

1. Go to <https://vercel.com> → **Add New… → Project**.
2. Import the GitHub repo.
3. Framework preset: **Next.js** (auto-detected).
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` → your Vercel URL (e.g. `https://bobo-golf.vercel.app`)
5. **Deploy**.

Every push to `main` redeploys automatically.

---

## Local development

```bash
cp .env.example .env.local   # fill in the values from step 3
npm install
npm run dev                  # http://localhost:3000
```

Sign in with magic link → check your email → you'll land on `/trips`.

---

## How the trip flow works

1. **Sign in** — magic link to email. A `profiles` row is created
   automatically (display name defaults to the part of your email before `@`).
2. **Create a trip** at `/trips`. You become the organizer.
3. **Add the boys**: each one signs in, then either you share the join link
   (`/trips/<id>`) and they hit "Join trip", or you add their profile IDs in
   Supabase Table Editor → `trip_members`.
4. **Log rounds**: add a course + date, then enter each player's strokes.
5. **Track bets**: propose a side bet (any amount, any description), settle it
   by picking a winner when the round's done.

---

## Where to add features next

The schema and RLS give you a lot to build on. Easy wins:

- **Hole-by-hole scoring**: add a `hole_scores` table (`score_id, hole, strokes`)
  and a 9/18-hole grid input.
- **Skins / Nassau / Wolf**: the `bets` table is intentionally generic —
  formalize specific game types as separate tables or as a `type` column.
- **Photo gallery per trip**: Supabase Storage bucket + a `trip_photos` table.
- **Payments tally**: a `/settle-up` view that sums settled bets by winner and
  shows who owes whom.
- **iCal export** for the trip dates.
- **Push notifications** when a round is added or a bet is settled (Supabase
  Realtime → service worker).

---

## File map

```
src/
  app/
    layout.tsx              # header, auth-aware nav
    page.tsx                # landing page
    actions.ts              # signOut server action
    login/page.tsx          # magic-link form
    auth/callback/route.ts  # exchanges the code for a session
    trips/
      page.tsx              # list + create
      actions.ts            # all server actions (trips, rounds, bets, scores, airbnbs)
      [id]/page.tsx         # trip detail: leaderboard, rounds, airbnbs, bets, roster
    bets/page.tsx           # all bets across your trips
    not-found.tsx
  lib/supabase/
    client.ts               # browser client
    server.ts               # server component / action client
    middleware.ts           # session refresh + auth gate
  middleware.ts             # mount the auth gate
supabase/
  migrations/0001_init.sql  # schema + RLS — run this in Supabase SQL editor
```

---

## Notes on MCP

This project doesn't require any Model-Context-Protocol setup to use, but if
you want Claude to manage data through MCP later:

- **Supabase MCP server**: <https://github.com/supabase-community/supabase-mcp>
  lets Claude query your DB.
- **Vercel MCP server**: <https://github.com/vercel-labs/mcp-for-next.js>
  exposes Vercel deploy info.

Add either to your `~/.claude.json` or `.mcp.json` and Claude can read/write
the project directly from the chat.
