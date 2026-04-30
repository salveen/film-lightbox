# Film Lightbox

Light, browser-based photo slideshow for a TV. Three simple modes:

- Host (TV): shows a 6-digit room code. Guests join with the code and upload photos from phones.
- Upload (phone): enter the 6-digit code, pick photos, they upload to the room and show on the TV.
- Solo (offline): single-device editor + player. Photos and optional audio are stored in IndexedDB; no backend required.

Quick links

- Host page: `/host`
- Upload page: `/upload`
- Solo editor: `/solo`
- Player (fullscreen): `/play`

Prerequisites

- Node 20+ and `pnpm` (or use `npm`/`yarn` after editing scripts)
- A Supabase project for host/upload modes (optional if you only use `solo`)

Local development

```bash
pnpm install
pnpm dev
# open http://localhost:5173
```

Build & preview

```bash
pnpm build
pnpm preview
# or in production build output: node build
```

Supabase setup (for Host / Upload)

1. Create a Supabase project at https://supabase.com.
2. Storage → New bucket → name: `rooms`. For simplicity the app expects this bucket to be public so uploads and public URLs are accessible from the TV. If you need privacy, use signed URLs and change the upload/read flow.
3. In Project → Settings → API, copy the project URL and anon key. Also copy the service role key if you plan to run server cleanup or server-side `yt-dlp` extraction.

Environment variables

Copy the example and set values:

```bash
cp .env.example .env
# then edit .env and fill values
```

- `PUBLIC_SUPABASE_URL` — your supabase project URL (https://xyz.supabase.co)
- `PUBLIC_SUPABASE_ANON_KEY` — the anon (publishable) key
- `PUBLIC_SUPABASE_BUCKET` — usually `rooms`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key (keep secret; used by cleanup and optional server tasks)
- `ROOM_TTL_HOURS` — how long room folders are kept (optional)

Important: this project uses SvelteKit's `$env/static/public` for `PUBLIC_*` variables. Those values are inlined at build time, so when deploying you must provide `PUBLIC_*` during the build step (see Deploying below).

Deployment notes (Fly.io example)

Provide `PUBLIC_*` as build args so the client bundle contains the correct URLs/keys, and set server-only secrets separately.

```bash
# set secrets (server-only)
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" ROOM_TTL_HOURS=3

# deploy and inline public envs at build-time
flyctl deploy --app film-light-box \
	--build-arg PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
	--build-arg PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
	--build-arg PUBLIC_SUPABASE_BUCKET=rooms
```

CI (GitHub Actions) snippet

```yaml
- name: Deploy to Fly
	run: flyctl deploy --app film-light-box \
		--build-arg PUBLIC_SUPABASE_URL=${{ secrets.SUPABASE_URL }} \
		--build-arg PUBLIC_SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }} \
		--build-arg PUBLIC_SUPABASE_BUCKET=rooms
	env:
		FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Server-only `yt-dlp` (optional)

The app includes an optional server endpoint to extract direct audio streams from YouTube via `yt-dlp`. This is optional — solo mode supports saving a YouTube link locally and playing it in the browser. If you enable server extraction, install `yt-dlp` on the host and set `YT_DLP_BIN` in the environment (or include it in your Dockerfile). Keep `SUPABASE_SERVICE_ROLE_KEY` secret.

How to use

- Host (TV): open `/host`. The TV will show a 6-digit code and poll the Supabase `rooms/<code>/` folder for uploaded images. Click Start to run the slideshow.
- Upload (phone): open `/upload`. Enter the 6-digit code shown on the TV, pick photos, and upload. Images are resized client-side before upload.
- Solo: open `/solo` to add photos and optional audio locally, then open `/play` to run the fullscreen slideshow (no network required).

Security & privacy

- The `rooms` bucket being public is the simplest setup but means anyone who knows a room code can upload/read files. Use short TTL and monitor usage for public events.
- `PUBLIC_*` keys are intentionally publishable (they are used by client SDKs). Keep `SUPABASE_SERVICE_ROLE_KEY` secret and only set it as a server secret (not baked into client builds).

Troubleshooting

- "Invalid supabaseUrl" build/runtime: ensure `PUBLIC_SUPABASE_URL` is a full https URL and was provided at build time if you use `$env/static/public`.
- Missing uploads on TV: confirm the `rooms` bucket exists and uploaded files are in `rooms/<code>/`.

Next improvements

- Add a small debug endpoint to list bucket folder contents remotely.
- Replace polling with Supabase realtime subscriptions for immediate updates.

License

MIT — feel free to fork and adapt for parties.

Enjoy the slideshow!

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
