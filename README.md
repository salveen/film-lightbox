# Film Lightbox

A photo + music slideshow you can play on your TV. Three modes:

- **Host on TV** — TV shows a 6-digit room code, friends upload photos from their phones, slideshow plays.
- **Upload from phone** — enter code, pick photos, they appear on the TV.
- **Solo (offline)** — one device, photos stay in IndexedDB, no backend needed. Works zero-config.

Quick links

- Host page: `/host`
- Upload page: `/upload`
- Solo editor: `/solo`
- Player (fullscreen): `/play`

## Develop

```sh
pnpm install
pnpm dev
# open http://localhost:5173
```

Solo mode works immediately. Host/Upload modes need Supabase env vars.

## Setup (Host/Upload modes)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Storage → New bucket → name it `rooms` → make it **public**.
3. Storage → Policies → on the `rooms` bucket, add a policy allowing `INSERT` and `SELECT` for the `anon` role.
4. Project Settings → API → copy the URL, anon key, and service-role key.

### 2. Environment

```sh
cp .env.example .env
```

Fill in:

- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_BUCKET=rooms`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by cleanup)
- `ROOM_TTL_HOURS` (optional, default 24)
- `CRON_SECRET` (optional; if set, the GET cleanup endpoint requires `Authorization: Bearer <secret>`)

`PUBLIC_*` vars are inlined at build time via SvelteKit's `$env/static/public`. On Vercel, set them in the project's Environment Variables — they will be available during the build.

## Deploy to Vercel

This project uses `@sveltejs/adapter-vercel` and ships with a `vercel.json` that runs `/api/cleanup` hourly via Vercel Cron.

### Option A — Vercel dashboard

1. Push the repo to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new). Vercel auto-detects SvelteKit.
3. Add the env vars listed above (Production + Preview).
4. Deploy.

### Option B — Vercel CLI

```sh
npm i -g vercel
vercel link
vercel env add PUBLIC_SUPABASE_URL
vercel env add PUBLIC_SUPABASE_ANON_KEY
vercel env add PUBLIC_SUPABASE_BUCKET
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ROOM_TTL_HOURS
vercel env add CRON_SECRET   # optional
vercel --prod
```

### Cleanup cron

`vercel.json` schedules `GET /api/cleanup` at the top of every hour. The endpoint deletes objects in the `rooms` bucket older than `ROOM_TTL_HOURS`. Vercel Cron runs from a Vercel-managed origin; set `CRON_SECRET` to require an auth header. The endpoint also accepts `POST` for manual runs.

## Architecture

- `src/routes/host/` — TV page, generates room code, polls Supabase Storage for new uploads, plays slideshow with triple-buffer.
- `src/routes/upload/` — phone page, client-side resize to 1920×1080 JPEG via canvas, upload to `room_<code>/` folder.
- `src/routes/solo/` — IndexedDB-only editor (no backend).
- `src/routes/play/` — solo fullscreen player with crossfade, paired-portrait layout, optional YouTube background music.
- `src/routes/api/cleanup/` — deletes stale room folders.

## Limitations

- Anyone who guesses a 6-digit code can read/write to that room. Acceptable for short-lived parties; not for sensitive media.
- Background music is YouTube-only — pick a track or playlist URL, it embeds via the YouTube iframe.

## License

MIT — feel free to fork and adapt for parties.
