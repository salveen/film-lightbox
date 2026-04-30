# Film Lightbox

A photo + music slideshow you can play on your TV. Three modes:

- **Host on TV** — TV shows a 6-digit room code, friends upload photos from their phones, slideshow plays.
- **Upload from phone** — enter code, pick photos, they appear on the TV.
- **Solo (offline)** — one device, photos stay in IndexedDB, no backend needed. Works zero-config.

## Develop

```sh
pnpm install
pnpm dev
```

Solo mode works immediately. Host/Upload modes need Supabase env vars. You can also supply a YouTube link from a phone; server-side extraction with `yt-dlp` is optional.

## Setup (Host/Upload modes)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Storage → New bucket → name it `rooms` → make it **public**.
3. Storage → Policies → on the `rooms` bucket, add a policy allowing `INSERT` and `SELECT` for the `anon` role. Easiest path: enable the bundled "Allow public read+write" template, or add a policy `bucket_id = 'rooms'` for both operations.
4. Project Settings → API → copy the URL, anon key, and service-role key.

### 2. Environment

```sh
cp .env.example .env
```

Fill in:

- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_BUCKET=rooms`
- `SUPABASE_SERVICE_ROLE_KEY` (only used by the cleanup endpoint, server-only)
<!-- yt-dlp is optional; phone-sent YouTube links are supported -->

### 4. Cleanup (optional)

`POST /api/cleanup` deletes objects in the `rooms` bucket older than `ROOM_TTL_HOURS` (default 24). Wire it up to a cron — Supabase scheduled function, GitHub Actions, or a fly.io cron.

## Build & deploy

```sh
pnpm build
node build
```

Uses `@sveltejs/adapter-node` so it deploys anywhere with Node 20+. The `/api/audio` endpoint requires `yt-dlp` on the host. Recommended hosts:

- **Fly.io** — has a free-ish allowance, supports custom Dockerfiles for installing yt-dlp.
- **Railway** — easy to deploy, ~$5/mo minimum.
- **Vercel** — possible but yt-dlp on serverless is fragile.

## Architecture

- `src/routes/host/` — TV page, generates room code, polls Supabase Storage for new uploads, plays slideshow with triple-buffer (only ~3 images decoded at a time so weak TV browsers don't OOM).
- `src/routes/upload/` — phone page, client-side resize to 1920×1080 JPEG via canvas, upload to `room_<code>/` folder.
- `src/routes/solo/` — IndexedDB-only editor (no backend).
- `src/routes/play/` — solo fullscreen player with crossfade, paired-portrait layout, beat sync.
- `src/routes/api/audio/` — `POST { url }` → spawns `yt-dlp -g` → returns direct audio stream URL.
- `src/routes/api/cleanup/` — deletes stale room folders.

## Limitations

- Anyone who guesses a 6-digit code can read/write to that room. Acceptable for short-lived parties; not for sensitive media.
- YouTube stream URLs from `yt-dlp -g` expire after a few hours.
- Beat-sync requires a local audio file (Web Audio can't analyze a YouTube stream cross-origin).
