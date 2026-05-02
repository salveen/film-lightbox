# Film Lightbox

Turn any screen into a living gallery. Anyone in the room — or across the country — can contribute photos and music to a shared slideshow using a 6-digit code. No apps to install, no accounts to create, no friction. Point a phone at the screen, enter the code, and your photos appear seconds later. Set the mood by syncing a YouTube soundtrack from your phone — the display picks it up automatically.

<p align="center">
  <img src="assets/desktop_room.png" alt="Host screen slideshow" style="width:48%;max-width:420px;margin-right:8px;border:1px solid #eee;border-radius:6px" />
  <img src="assets/phone_upload_room_filled.PNG" alt="Upload from phone" style="width:48%;max-width:420px;border:1px solid #eee;border-radius:6px" />
</p>

---

## When to reach for it

- **Parties & celebrations** — birthday, wedding, baby shower. Put the code on a card at the entrance; guests contribute photos throughout the night and they loop on the host screen in the background.
- **Family reunions** — everyone uploads from their camera rolls, one screen becomes the shared memory.
- **Remote gatherings** — stream the host screen while friends and family contribute from anywhere with an internet connection. The slideshow updates live for everyone watching.
- **Memorials & tributes** — a quiet display of photos submitted by anyone who loved the person, no coordinator needed.
- **Year in review** — New Year's Eve, graduation, end of year. Share the reel, add a playlist, let the room set the mood.
- **Event photo walls** — conference hallways, office parties, school events. Guests see themselves on screen within seconds of uploading.

---

## Walkthrough

**Step 1 — Open the site on your host device and click Host**

<img src="assets/desktop_main_menu.png" alt="Landing page — choose Host or Upload" width="100%" />

*The landing page. Pick **Host** on the device that will run the display.*

---

**Step 2 — A 6-digit room code appears. Share it with your guests**

<img src="assets/desktop_room.png" alt="Empty host room waiting for uploads" width="100%" />

*The host screen is now live and waiting. Tell guests the code verbally, write it on a card, or just point at the screen. No uploads yet — the slideshow starts the moment the first photo arrives.*

---

**Step 3 — Guests open the same URL on their phones and enter the code**

<table width="100%"><tr>
<td width="50%"><img src="assets/phone_main_menu.png" alt="Mobile landing page" width="100%" /></td>
<td width="50%"><img src="assets/phone_join_room.png" alt="Entering the room code" width="100%" /></td>
</tr></table>

*Tap **Upload** on the phone, type the 6-digit code from the screen, and you're in — no account, no app to install. Anyone with the code can join; the whole room contributes to the same session at the same time.*

---

**Step 4 — Select photos and send them to the screen**

<table width="100%"><tr>
<td width="50%"><img src="assets/phone_upload_pics_empty.png" alt="Upload screen before selecting photos" width="100%" /></td>
<td width="50%"><img src="assets/phone_upload_room_filled.png" alt="Photos selected and ready to upload" width="100%" /></td>
</tr></table>

*Pick photos from your camera roll. They're resized on the phone before leaving — even hotel Wi-Fi keeps up. You can also paste a YouTube link to set the background music; the host picks it up instantly and starts playing it for the whole room.*

---

**Step 5 — Photos appear on the host screen within seconds**

<img src="assets/desktop_room_pics_uploaded.png" alt="Slideshow running with uploaded photos" width="100%" />

*The host view refreshes every 3 seconds. As guests upload, photos fade into the slideshow automatically — no one needs to touch the host device.*

---

## Modes

| Mode | URL | What it does |
|------|-----|--------------|
| **Host** | `/host` | Opens on the host device. Generates a 6-digit room code, polls for incoming uploads every 3 seconds, and runs the slideshow in fullscreen with smooth crossfade transitions. |
| **Upload** | `/upload` | Guest view. Enter the room code, pick photos (resized client-side before upload), and optionally paste a YouTube link to set the background music — the host picks it up automatically. |
| **Solo** | `/solo` | Offline editor and player. Photos and a YouTube link are stored in IndexedDB; works with no backend at all. Useful as a personal slideshow tool or when there's no internet. |

---

## How it works

### Host / guest handshake

```
┌─────────────┐                     ┌──────────────────┐                     ┌─────────────┐
│   Phone     │  upload JPEG ──────▶│ Supabase bucket  │◀───── poll (3s) ────│    Host     │
│  /upload    │  upsert URL  ──────▶│  room_<code>/    │                     │   /host     │
└─────────────┘                     └──────────────────┘                     └─────────────┘
                                          │
                                          │  daily Vercel Cron
                                          ▼
                                    /api/cleanup
                                    (deletes rooms older than ROOM_TTL_HOURS)
```

- **Room codes** are 6-digit numbers generated in the browser. There's no auth — the code *is* the access token. Right for short-lived gatherings; not for sensitive media (see [Limitations](#limitations)).
- **Photo uploads** are resized to 1920×1080 JPEG in an `OffscreenCanvas` before leaving the phone, so the network sees ~200 KB instead of 5 MB. Files are named `<timestamp>_<rand>.jpg` so the host's `created_at` sort gives a stable display order.
- **Music sync** works via a single text file: the phone upserts `youtube.txt` with the URL, and the host's poller watches its `updated_at` timestamp. When it changes, the host re-fetches with a cache-busted URL and remounts the YouTube iframe — the embed swaps cleanly mid-slideshow.
- **Session recovery** — each host session gets a randomly-generated safe word (e.g. `cedar`, `dusk`, `ember`). If the browser tab closes accidentally, the host can reopen their room by entering the 6-digit code and the word, without losing any uploaded photos.
- **Cleanup** runs daily via Vercel Cron — `GET /api/cleanup` walks the bucket and deletes rooms older than `ROOM_TTL_HOURS`. Optionally gated by a `CRON_SECRET` bearer token.

### The player

- **Triple-buffered** — only the current and next slide nodes are in the DOM at any time, so low-powered browsers on older devices don't run out of memory on a 200-photo deck.
- **Crossfade** is driven by `requestAnimationFrame` and `performance.now()`, not CSS transitions, so seeking forward or backward with arrow keys is instant.
- **Keyboard controls** (when the slideshow is running): `←` / `→` to navigate, `Space` to pause, `F` to toggle fullscreen, `Esc` to exit.
- **Portrait pairing** — consecutive portrait photos are automatically grouped side-by-side.

### Solo mode

Same player, different source: `loadProject()` from IndexedDB instead of polling Supabase. Photo blobs are stored directly in the browser; no server involved.

---

## Project structure

```
src/
├── lib/
│   ├── db.ts              IndexedDB schema + photo/project operations (solo mode)
│   ├── supabase.ts        Browser Supabase client (anon key)
│   ├── server/supabase.ts Server Supabase client (service role, used only by /api/cleanup)
│   ├── roomCode.ts        6-digit code generation + validation
│   ├── roomWord.ts        Safe-word list for host session recovery
│   ├── resizeImage.ts     OffscreenCanvas → JPEG pipeline (1920×1080 cap)
│   ├── youtube.ts         URL → video ID parsing, embed URL builder
│   └── slides.ts          Photo array → slide list (handles portrait pairing)
└── routes/
    ├── +page.svelte       Landing page (mode picker)
    ├── host/              Host view: room code, polling, fullscreen player
    ├── upload/            Phone view: photo + music input
    ├── solo/              Offline editor
    ├── play/              Solo fullscreen player
    └── api/cleanup/       Daily TTL sweep (POST manual / GET cron)
```

---

## Running locally

Requires Node 20+ and `pnpm`.

```sh
pnpm install
pnpm dev
# open http://localhost:5173
```

Solo mode works zero-config. For host/upload mode, copy `.env.example` → `.env` and fill in your Supabase credentials.

```sh
pnpm check     # type-check
pnpm build     # production build
pnpm preview   # serve the build locally
```

---

## Deployment (Vercel)

The repo ships with `@sveltejs/adapter-vercel` and a `vercel.json` that schedules the cleanup cron.

1. **Supabase** — create a project, add a public Storage bucket named `rooms`, and enable `INSERT` + `SELECT` policies for the `anon` role.
2. **Vercel** — import the GitHub repo. SvelteKit is auto-detected.
3. **Environment variables** (Production + Preview):

   | Name | Scope | Notes |
   |------|-------|-------|
   | `PUBLIC_SUPABASE_URL` | Public, build-time | Inlined into the client bundle. |
   | `PUBLIC_SUPABASE_ANON_KEY` | Public, build-time | Inlined into the client bundle. |
   | `PUBLIC_SUPABASE_BUCKET` | Public, build-time | Default `rooms`. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Used by `/api/cleanup`. |
   | `ROOM_TTL_HOURS` | Server-only | Optional, default `24`. |
   | `CRON_SECRET` | Server-only | Optional bearer-token gate for the cron endpoint. |

4. Deploy. Vercel provisions the cron automatically from `vercel.json`.

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **SvelteKit 2** + **Svelte 5 (runes)** | Tiny bundle, file-based routing, and `$state` / `$derived` make the slideshow timing logic readable. |
| Language | **TypeScript** | Strong types across DB schemas and Supabase responses. |
| Storage (shared) | **Supabase Storage** | One public bucket per environment; rooms are folders (`room_<code>/`). No relational data needed, so Postgres is skipped entirely. |
| Storage (local) | **IndexedDB** via `idb` | Solo mode persists the entire project — photo blobs, ordering, settings — without a server. |
| Image pipeline | **OffscreenCanvas** + `createImageBitmap` | Photos are resized to 1920×1080 JPEG on the phone before upload, so the network sees ~200 KB instead of 5 MB. |
| Hosting | **Vercel** (`@sveltejs/adapter-vercel`) | Static client + serverless `/api/*` routes + Vercel Cron for cleanup. |
| Background music | **YouTube IFrame embed** | No licensing headaches, no audio files to host. Guest sends a URL, host embeds it. |

---

## Design decisions

- **No realtime, no WebSockets.** A 3-second poll is good enough for a slideshow that updates every minute or two. Fewer dependencies, simpler deployment, trivial to reason about.
- **No database.** Folders in Supabase Storage *are* the data model. Listing a folder gives an ordered file list with `created_at`; that's the entire host-mode read path.
- **Guest-only music input.** Typing a YouTube URL with a remote control is miserable. The host view has no text input at all — everything is set from a guest device.
- **Public bucket + short TTL** instead of signed URLs. Tradeoff: anyone with the code can read/write, but the room evaporates within hours. Right for ephemeral parties; explicitly wrong for sensitive media.
- **Client-side resize.** Capping uploads at 1920×1080 JPEG gets photos under 250 KB on average. Uploads on hotel Wi-Fi went from embarrassingly slow to near-instant.

---

## Limitations

- The 6-digit code is the only access control. Fine for parties, not for sensitive media.
- Background music is YouTube-only — paste a track or playlist URL and it embeds via the YouTube iframe API. No audio file uploads.
- The host browser must support `requestFullscreen()` and `OffscreenCanvas`. Most modern browsers do; very old or embedded devices may need a desktop browser instead.

---

## License

MIT.
