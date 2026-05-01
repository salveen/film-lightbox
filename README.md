# Film Lightbox

A lightweight photo slideshow for the TV that anyone in the room can contribute to from their phone. No accounts, no app to install — guests scan a 6-digit code, pick photos, and they appear on the screen in seconds.

<p align="center">
        <img src="assets/desktop_room.png" alt="TV slideshow" style="width:48%;max-width:420px;margin-right:8px;border:1px solid #eee;border-radius:6px" />
            <img src="assets/phone_upload_room_filled.PNG" alt="Upload from phone" style="width:48%;max-width:420px;border:1px solid #eee;border-radius:6px" />
</p>

Quick overview: guests scan a 6-digit room code on their phone, upload resized JPEGs (client-side), and the host view (TV) polls the shared Supabase Storage bucket to show incoming photos in a fullscreen slideshow.

---

## Assets gallery

All images currently in the `assets/` folder are shown below. If an image appears as a placeholder in your editor, add the corresponding file to `assets/` or run `pnpm dev` to serve the static files locally.

<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
    <img src="assets/desktop_main_menu.png" alt="desktop_main_menu" style="width:240px;height:auto;border:1px solid #eee;border-radius:6px" />
    <img src="assets/desktop_room.png" alt="desktop_room" style="width:240px;height:auto;border:1px solid #eee;border-radius:6px" />
    <img src="assets/desktop_room_pics_uploaded.png" alt="desktop_room_pics_uploaded" style="width:240px;height:auto;border:1px solid #eee;border-radius:6px" />
    <img src="assets/phone_join_room.PNG" alt="phone_join_room" style="width:160px;height:auto;border:1px solid #eee;border-radius:6px" />
    <img src="assets/phone_main_menu.PNG" alt="phone_main_menu" style="width:160px;height:auto;border:1px solid #eee;border-radius:6px" />
    <img src="assets/phone_upload_pics_empty.PNG" alt="phone_upload_pics_empty" style="width:160px;height:auto;border:1px solid #eee;border-radius:6px" />
    <img src="assets/phone_upload_room_filled.PNG" alt="phone_upload_room_filled" style="width:160px;height:auto;border:1px solid #eee;border-radius:6px" />
</div>

> Built as a weekend project so I'd stop fumbling AirPlay at parties. Three modes, one stack, zero login screens.

---

## Modes

| Mode | URL | What it does |
| --- | --- | --- |
| **Host** | `/host` | Opens on the TV. Generates a 6-digit room code, polls Supabase Storage for incoming uploads, runs the slideshow in fullscreen with crossfade. |
| **Upload** | `/upload` | Phone view. Enter the room code, pick photos (resized client-side before upload), and optionally paste a YouTube link to set the background music — the TV picks it up automatically. |
| **Solo** | `/solo` | Offline editor + player. Photos and YouTube link are stored in IndexedDB; works with no backend at all. Useful as a personal slideshow tool or as a fallback when there's no internet. |

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **SvelteKit 2** + **Svelte 5 (runes)** | Tiny bundle, file-based routing, and `$state` / `$derived` make the slideshow timing logic readable. |
| Language | **TypeScript** | Strong types across DB schemas and Supabase responses. |
| Storage (shared) | **Supabase Storage** | One public bucket per environment; rooms are folders (`room_<code>/`). No relational data needed, so I skipped Postgres entirely. |
| Storage (local) | **IndexedDB** via `idb` | Solo mode persists the entire project — photo blobs, ordering, settings — without a server. |
| Image pipeline | **OffscreenCanvas** + `createImageBitmap` | Photos are resized to 1920×1080 JPEG on the phone before upload, so the network sees ~200 KB instead of 5 MB. |
| Hosting | **Vercel** (`@sveltejs/adapter-vercel`) | Static client + serverless `/api/*` routes + Vercel Cron for cleanup. |
| Background music | **YouTube IFrame embed** | No licensing headaches, no audio files to host. Phone sends a URL, TV embeds it. |

---

## How it works

### The host/phone handshake

```
┌─────────────┐                     ┌──────────────────┐                     ┌─────────────┐
│   Phone     │  upload JPEG ──────▶│ Supabase bucket  │◀───── poll (3s) ────│   TV/Host   │
│  /upload    │  upsert URL  ──────▶│  room_<code>/    │                     │   /host     │
└─────────────┘                     └──────────────────┘                     └─────────────┘
                                          │
                                          │  hourly Vercel Cron
                                          ▼
                                    /api/cleanup
                                    (deletes objects older than ROOM_TTL_HOURS)
```

- **Room codes** are 6-digit numbers generated client-side. There's no auth — the code *is* the access token. Acceptable for short-lived parties; not for sensitive media (see [Limitations](#limitations)).
- **Photo uploads** are resized in `OffscreenCanvas` and named `<timestamp>_<rand>.jpg` so the host's `created_at` sort gives a stable display order.
- **Music sync** uses a single text file: the phone upserts `youtube.txt` with the URL, and the host's poller watches its `updated_at` signature. When it changes, the host re-fetches with a cache-busted URL and remounts the YouTube iframe (`{#key videoId}` swaps the embed cleanly mid-slideshow).
- **Cleanup** runs hourly via Vercel Cron — `GET /api/cleanup` walks the bucket and deletes objects older than `ROOM_TTL_HOURS`. Optionally gated by a `CRON_SECRET` bearer token.

### The player

- Triple-buffered: only the current and next slide DOM nodes are rendered at any time, so weak smart-TV browsers don't OOM on a 200-photo deck.
- Crossfade is driven by `requestAnimationFrame` reading `performance.now()` — no CSS transitions, so seeking forward/backward with arrow keys is instant.
- Vertical photos can be paired side-by-side (configurable per project) — a small `buildSlides()` reducer in [`src/lib/slides.ts`](src/lib/slides.ts) groups portraits when the next photo is also a portrait.
- Per-photo duration override on top of a project-wide default.

### Solo mode

- Same player, different source: `loadProject()` from IndexedDB instead of polling Supabase.
- Photo blobs are stored directly; the project record only keeps the ordered list of IDs and the settings.
- Music is YouTube-only by design — no audio file uploads, no licensing risk, no megabytes in IndexedDB.

---

## Project structure

```
src/
├── lib/
│   ├── db.ts              IndexedDB schema + photo/audio/project operations (solo mode)
│   ├── supabase.ts        Browser Supabase client (anon key)
│   ├── server/supabase.ts Server Supabase client (service role, used only by /api/cleanup)
│   ├── roomCode.ts        6-digit code generation + validation
│   ├── resizeImage.ts     OffscreenCanvas → JPEG pipeline (1920×1080 cap)
│   ├── youtube.ts         URL → video ID parsing, embed URL builder
│   └── slides.ts          Photo array → slide list (handles portrait pairing)
└── routes/
    ├── +page.svelte       Landing page (mode picker)
    ├── host/              TV view: code, polling, fullscreen player
    ├── upload/            Phone view: photo + music input
    ├── solo/              Offline editor
    ├── play/              Solo fullscreen player
    └── api/cleanup/       Hourly TTL sweep (POST manual / GET cron)
```

---

## Running locally

Requires Node 20+ and `pnpm`.

```sh
pnpm install
pnpm dev
# open http://localhost:5173
```

Solo mode works zero-config. For host/upload, copy `.env.example` → `.env` and fill in your Supabase credentials.

```sh
pnpm check     # type-check
pnpm build     # production build
pnpm preview   # serve the build locally
```

---

## Deployment (Vercel)

The repo ships with `@sveltejs/adapter-vercel` and a `vercel.json` that schedules the cleanup cron.

1. **Supabase**: create a project, add a public Storage bucket named `rooms`, and enable `INSERT` + `SELECT` policies for the `anon` role.
2. **Vercel**: import the GitHub repo at [vercel.com/new](https://vercel.com/new). SvelteKit is auto-detected.
3. **Environment variables** (Production + Preview):

   | Name | Scope | Notes |
   | --- | --- | --- |
   | `PUBLIC_SUPABASE_URL` | Public, build-time | Inlined into the client bundle. |
   | `PUBLIC_SUPABASE_ANON_KEY` | Public, build-time | Inlined into the client bundle. |
   | `PUBLIC_SUPABASE_BUCKET` | Public, build-time | Default `rooms`. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Used by `/api/cleanup`. |
   | `ROOM_TTL_HOURS` | Server-only | Optional, default `24`. |
   | `CRON_SECRET` | Server-only | Optional bearer-token gate for the cron endpoint. |

4. Deploy. Vercel will provision the cron automatically from `vercel.json`.

---

## Design decisions worth calling out

- **No realtime, no websockets.** A 3-second poll is good enough for a slideshow that updates "every minute or two." Saved a dependency, simplified deployment, and keeps the client trivial to reason about.
- **No database.** Folders in Supabase Storage are the data model. Listing a folder gives me an ordered file list with `created_at`; that's the entire host-mode read path.
- **Phone-only music input.** Typing a YouTube URL on a TV remote is miserable. The TV view has no input fields at all — every piece of text is set from a phone.
- **Public bucket + short TTL** instead of signed URLs. Tradeoff: anyone with the code can read/write, but the room evaporates within hours. Right call for ephemeral parties; explicitly wrong for anything sensitive.
- **IndexedDB for solo.** Photos already live in the user's browser as `File` objects — IndexedDB is the obvious place to keep them. No server, no quota negotiation with the user.
- **Client-side resize.** Capping at 1920×1080 JPEG gets photos under 250 KB on average. Uploads on hotel Wi-Fi went from "embarrassingly slow" to "instant."

---

## Limitations

- The 6-digit code is the only access control. Fine for parties, not for sensitive media.
- Background music is YouTube-only — pick a track or playlist URL, it embeds via the YouTube iframe API. No audio file uploads, no Web Audio analysis, no beat sync.
- The host browser must support `requestFullscreen()` and `OffscreenCanvas`. Most smart-TV browsers do; very old ones may need a desktop instead.

---

## License

MIT.
