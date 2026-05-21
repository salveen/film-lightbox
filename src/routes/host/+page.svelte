<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import { generateRoomCode } from '$lib/roomCode';
	import { generateRoomWord } from '$lib/roomWord';
	import { getSupabase, roomFolder, SUPABASE_BUCKET } from '$lib/supabase';
	import { extractVideoId, embedUrl } from '$lib/youtube';
	import { PRESET_SONGS } from '$lib/presetSongs';

	const SLIDE_MS = 5000;
	const TRANSITION_MS = 800;
	const MUSIC_FILE = 'youtube.txt';
	const ORDER_FILE = 'order.txt';
	const VIDEO_VOLUME = 0.4;

	type SlideKind = 'image' | 'video';
	interface SlideItem {
		name: string;
		url: string;
		kind: SlideKind;
	}

	function classify(name: string): SlideKind | null {
		if (name === MUSIC_FILE || name === ORDER_FILE) return null;
		const lower = name.toLowerCase();
		if (/\.(jpe?g|png|webp|gif|avif)$/.test(lower)) return 'image';
		if (/\.(webm|mp4|mov|m4v|ogv)$/.test(lower)) return 'video';
		return null;
	}

	async function readOrder(): Promise<string[]> {
		try {
			const supa = getSupabase();
			const { data: pub } = supa.storage
				.from(SUPABASE_BUCKET)
				.getPublicUrl(`${roomFolder(code)}/${ORDER_FILE}`);
			// Unique URL each call → CDN cache miss every time.
			// cache:'no-store' → browser never caches the response either.
			const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`, { cache: 'no-store' });
			if (!res.ok) return [];
			return (await res.text())
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	const HOST_WORD_FILE = 'host_word.txt';
	const LS_KEY = 'filmbox_room';
	const lsOrderKey = (c: string) => `filmbox_order_${c}`;

	let code = $state('');
	let word = $state('');
	let recovering = $state(false);
	let recoverCode = $state('');
	let recoverWord = $state('');
	let recoverError = $state('');
	let queue = $state<SlideItem[]>([]);
	let started = $state(false);
	let currentIndex = $state(0);
	let nextIndex = $state<number | null>(null);
	let transitionAt = $state(0);
	let videoId = $state<string | undefined>(undefined);
	let selectedPreset = $state<string>('');
	let paused = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let realtimeChannel: RealtimeChannel | null = null;
	let rafId: number | null = null;
	let lastAdvance = 0;
	let lastMusicSig: string | undefined;
	// Order received directly from the upload page via Realtime broadcast.
	// null = not yet received; we fall back to reading order.txt (for initial/reload).
	let liveOrder: string[] | null = null;

	async function listExisting() {
		const supa = getSupabase();
		const { data, error } = await supa.storage
			.from(SUPABASE_BUCKET)
			.list(roomFolder(code), { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
		if (error) {
			console.warn('list failed', error);
			return;
		}
		const files = data ?? [];
		const musicFile = files.find((f) => f.name === MUSIC_FILE);
		await syncMusic(musicFile);

		const validNames = new Set(files.map((f) => f.name).filter((n) => classify(n) !== null));
		// Use the order received live via broadcast (no network read, no caching issues).
		// Fall back to reading order.txt only on first load / after a page reload.
		const order = liveOrder ?? await readOrder();
		const ordered = order.filter((n) => validNames.has(n));

		const existingByName = new Map(queue.map((q) => [q.name, q]));
		const newQueue: SlideItem[] = ordered.map((name) => {
			const existing = existingByName.get(name);
			if (existing) return existing;
			const { data: pub } = supa.storage
				.from(SUPABASE_BUCKET)
				.getPublicUrl(`${roomFolder(code)}/${name}`);
			return { name, url: pub.publicUrl, kind: classify(name)! };
		});

		const changed =
			newQueue.length !== queue.length ||
			newQueue.some((q, i) => queue[i]?.name !== q.name);
		if (!changed) return;

		const validSet = new Set(ordered);
		const currentName = queue[currentIndex]?.name;
		if (currentName && !validSet.has(currentName)) {
			currentIndex = 0;
			nextIndex = null;
			lastAdvance = performance.now();
		} else if (currentName) {
			const newIdx = newQueue.findIndex((q) => q.name === currentName);
			if (newIdx >= 0) currentIndex = newIdx;
		}
		if (currentIndex >= newQueue.length) currentIndex = 0;
		if (nextIndex !== null && nextIndex >= newQueue.length) nextIndex = null;

		queue = newQueue;
	}

	async function syncMusic(file: { updated_at?: string | null; created_at?: string | null } | undefined) {
		if (!file) {
			if (lastMusicSig !== undefined) {
				lastMusicSig = undefined;
				videoId = undefined;
			}
			return;
		}
		const sig = file.updated_at ?? file.created_at ?? '';
		if (sig === lastMusicSig) return;
		lastMusicSig = sig;
		const supa = getSupabase();
		const path = `${roomFolder(code)}/${MUSIC_FILE}`;
		const { data: pub } = supa.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
		try {
			const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`);
			if (!res.ok) return;
			const txt = (await res.text()).trim();
			const id = extractVideoId(txt);
			videoId = id ?? undefined;
		} catch (e) {
			console.warn('failed to fetch music file', e);
		}
	}

	function startPolling() {
		pollTimer = setInterval(listExisting, 1000);
	}

	async function setHostMusic(url: string) {
		if (!extractVideoId(url)) return;
		try {
			const supa = getSupabase();
			const path = `${roomFolder(code)}/${MUSIC_FILE}`;
			const blob = new Blob([url], { type: 'text/plain' });
			await supa.storage
				.from(SUPABASE_BUCKET)
				.upload(path, blob, { contentType: 'text/plain', upsert: true });
		} catch (e) {
			console.warn('failed to set host music', e);
		}
	}

	async function clearHostMusic() {
		try {
			const supa = getSupabase();
			const path = `${roomFolder(code)}/${MUSIC_FILE}`;
			const blob = new Blob([''], { type: 'text/plain' });
			await supa.storage
				.from(SUPABASE_BUCKET)
				.upload(path, blob, { contentType: 'text/plain', upsert: true });
			selectedPreset = '';
		} catch (e) {
			console.warn('failed to clear host music', e);
		}
	}

	function onPresetChange(e: Event) {
		const url = (e.currentTarget as HTMLSelectElement).value;
		selectedPreset = url;
		if (url) void setHostMusic(url);
	}

	function startRealtime() {
		const supa = getSupabase();
		if (realtimeChannel) void supa.removeChannel(realtimeChannel);
		realtimeChannel = supa
			.channel(`room-${code}`)
			.on('broadcast', { event: 'updated' }, ({ payload }) => {
				// Store the order from the payload so listExisting() never needs to
				// fetch order.txt from the network — bypasses all caching entirely.
				if (Array.isArray(payload?.order)) {
					liveOrder = payload.order as string[];
					// Persist so the next host page reload gets the correct order immediately.
					localStorage.setItem(lsOrderKey(code), JSON.stringify(liveOrder));
				}
				void listExisting();
			})
			.subscribe();
	}

	function tick() {
		rafId = requestAnimationFrame(tick);
		if (!started || paused || queue.length === 0) return;
		const now = performance.now();
		if (nextIndex === null) {
			const current = queue[currentIndex];
			const isVideo = current?.kind === 'video';
			if (!isVideo && now - lastAdvance >= SLIDE_MS && queue.length > 1) {
				nextIndex = (currentIndex + 1) % queue.length;
				transitionAt = now;
			}
		} else {
			const t = (now - transitionAt) / TRANSITION_MS;
			if (t >= 1) {
				currentIndex = nextIndex;
				nextIndex = null;
				lastAdvance = now;
			}
		}
	}

	function onVideoEnded() {
		if (queue.length <= 1) {
			lastAdvance = performance.now();
			return;
		}
		if (nextIndex !== null) return;
		nextIndex = (currentIndex + 1) % queue.length;
		transitionAt = performance.now();
	}

	$effect(() => {
		void currentIndex;
		void nextIndex;
		void paused;
		void started;
		if (!containerEl) return;
		const visible = new Set<number>([currentIndex]);
		if (nextIndex !== null) visible.add(nextIndex);
		const videos = containerEl.querySelectorAll<HTMLVideoElement>('video[data-slide-i]');
		for (const v of videos) {
			const idx = Number(v.dataset.slideI);
			const shouldPlay = started && !paused && visible.has(idx);
			if (shouldPlay) {
				void v.play().catch(() => {});
			} else {
				v.pause();
				if (!visible.has(idx)) v.currentTime = 0;
			}
		}
	});

	async function start() {
		started = true;
		lastAdvance = performance.now();
		if (containerEl?.requestFullscreen) {
			try {
				await containerEl.requestFullscreen();
			} catch {
				/* ignore */
			}
		}
		tick();
	}

	function exitFullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen();
		started = false;
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen();
		else if (containerEl?.requestFullscreen) void containerEl.requestFullscreen();
	}

	function onKey(e: KeyboardEvent) {
		if (!started) return;
		if (e.key === 'Escape') exitFullscreen();
		else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
		else if (e.key === ' ') {
			e.preventDefault();
			paused = !paused;
		} else if (e.key === 'ArrowRight' && queue.length > 1) {
			currentIndex = (currentIndex + 1) % queue.length;
			nextIndex = null;
			lastAdvance = performance.now();
		} else if (e.key === 'ArrowLeft' && queue.length > 1) {
			currentIndex = (currentIndex - 1 + queue.length) % queue.length;
			nextIndex = null;
			lastAdvance = performance.now();
		}
	}

	async function uploadHostWord(roomCode: string, roomWord: string) {
		try {
			const supa = getSupabase();
			const path = `${roomFolder(roomCode)}/${HOST_WORD_FILE}`;
			const blob = new Blob([roomWord], { type: 'text/plain' });
			await supa.storage.from(SUPABASE_BUCKET).upload(path, blob, { contentType: 'text/plain', upsert: true });
		} catch {
			/* non-fatal */
		}
	}

	function newRoom() {
		if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
		if (code) localStorage.removeItem(lsOrderKey(code));
		liveOrder = null;
		queue = [];
		videoId = undefined;
		lastMusicSig = undefined;
		code = generateRoomCode();
		word = generateRoomWord();
		localStorage.setItem(LS_KEY, JSON.stringify({ code, word }));
		void uploadHostWord(code, word);
		listExisting();
		startPolling();
		startRealtime();
	}

	async function recover() {
		recoverError = '';
		const trimCode = recoverCode.trim();
		const trimWord = recoverWord.trim().toLowerCase();
		if (!trimCode || !trimWord) return;
		try {
			const supa = getSupabase();
			const path = `${roomFolder(trimCode)}/${HOST_WORD_FILE}`;
			const { data: pub } = supa.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
			const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`);
			if (!res.ok) { recoverError = 'Room not found'; return; }
			const stored = (await res.text()).trim().toLowerCase();
			if (stored !== trimWord) { recoverError = 'Room not found'; return; }
			code = trimCode;
			word = trimWord;
			localStorage.setItem(LS_KEY, JSON.stringify({ code, word }));
			recovering = false;
			listExisting();
			startPolling();
			startRealtime();
		} catch {
			recoverError = 'Room not found';
		}
	}

	onMount(() => {
		const saved = localStorage.getItem(LS_KEY);
		if (saved) {
			try {
				const parsed = JSON.parse(saved) as { code?: string; word?: string };
				if (parsed.code && parsed.word) {
					code = parsed.code;
					word = parsed.word;
					// Restore last-known order so the first render is correct without
					// needing to read order.txt from the network (which can be stale/cached).
					try {
						const saved = localStorage.getItem(lsOrderKey(code));
						if (saved) liveOrder = JSON.parse(saved) as string[];
					} catch { /* ignore */ }
					listExisting();
					startPolling();
					startRealtime();
					return;
				}
			} catch { /* ignore */ }
		}
		code = generateRoomCode();
		word = generateRoomWord();
		localStorage.setItem(LS_KEY, JSON.stringify({ code, word }));
		void uploadHostWord(code, word);
		listExisting();
		startPolling();
		startRealtime();
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (rafId !== null) cancelAnimationFrame(rafId);
		if (realtimeChannel) void getSupabase().removeChannel(realtimeChannel);
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		const body = document.body;
		if (started) {
			html.style.setProperty('background-color', '#ffffff', 'important');
			body.style.setProperty('background-color', '#ffffff', 'important');
			html.style.setProperty('color-scheme', 'only light', 'important');
		} else {
			html.style.removeProperty('background-color');
			body.style.removeProperty('background-color');
			html.style.removeProperty('color-scheme');
		}
	});

	const visibleIndices = $derived.by(() => {
		if (queue.length === 0) return new Set<number>();
		const set = new Set<number>([currentIndex]);
		if (nextIndex !== null) set.add(nextIndex);
		const upcoming = (currentIndex + 1) % queue.length;
		set.add(upcoming);
		const prev = (currentIndex - 1 + queue.length) % queue.length;
		set.add(prev);
		return set;
	});
</script>

<svelte:window onkeydown={onKey} />

<div class="host" bind:this={containerEl} class:light={started}>
	{#if !started}
		<div class="lobby">
			{#if recovering}
				<h1>Recover session</h1>
				<div class="recover-form">
					<input
						type="tel"
						inputmode="numeric"
						placeholder="Room code"
						maxlength="6"
						bind:value={recoverCode}
						class="recover-input"
					/>
					<input
						type="text"
						placeholder="Session word"
						maxlength="20"
						bind:value={recoverWord}
						class="recover-input"
						oninput={(e) => (recoverWord = e.currentTarget.value.toLowerCase())}
					/>
					<div class="recover-actions">
						<button class="primary" onclick={recover}>Recover</button>
						<button onclick={() => { recovering = false; recoverError = ''; }}>Cancel</button>
					</div>
					{#if recoverError}
						<p class="recover-error">{recoverError}</p>
					{/if}
				</div>
			{:else}
				<h1>Room <span class="code">{code}</span></h1>
				<p class="word-label">session word: <strong class="word">{word}</strong></p>
				<p class="muted">
					On your phone: open this site → "Upload from phone" → enter code above
				</p>

				<p class="status photos">
					{queue.length} item{queue.length === 1 ? '' : 's'} ready
				</p>
				<p class="status music" class:on={!!videoId}>
					{videoId ? '🎵 Music linked' : '🎵 No music yet — add a YouTube link on your phone or from dropdown'}
				</p>

				{#if PRESET_SONGS.length > 0}
					<div class="preset-music">
						<select
							class="preset-select"
							bind:value={selectedPreset}
							onchange={onPresetChange}
						>
							<option value="">Choose a preset song…</option>
							{#each PRESET_SONGS as song}
								<option value={song.url}>{song.label}</option>
							{/each}
						</select>
						{#if videoId}
							<button class="clear-btn" onclick={clearHostMusic}>Clear</button>
						{/if}
					</div>
				{/if}

				<button class="primary big" onclick={start} disabled={queue.length === 0}>
					▶ Start slideshow
				</button>
				<p class="muted small">→ ← navigate · space pause · f fullscreen · esc exit</p>
				<div class="lobby-links">
					<button class="link-btn" onclick={() => { recovering = true; recoverCode = ''; recoverWord = ''; recoverError = ''; }}>
						Lost session? Recover
					</button>
					<button class="link-btn" onclick={newRoom}>Start new room</button>
				</div>
			{/if}
		</div>
	{:else}
		{#each queue as item, i (item.name)}
			{#if visibleIndices.has(i)}
				<div
					class="slide"
					style:opacity={i === currentIndex
						? nextIndex === null
							? 1
							: 1 - (performance.now() - transitionAt) / TRANSITION_MS
						: i === nextIndex
							? (performance.now() - transitionAt) / TRANSITION_MS
							: 0}
					style:z-index={i === currentIndex ? 2 : i === nextIndex ? 3 : 1}
				>
					{#if item.kind === 'video'}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={item.url}
							data-slide-i={i}
							playsinline
							preload="auto"
							onended={onVideoEnded}
							onloadedmetadata={(e) => (e.currentTarget.volume = VIDEO_VOLUME)}
						></video>
					{:else}
						<img src={item.url} alt="" />
					{/if}
				</div>
			{/if}
		{/each}
	{/if}

	{#if started && videoId}
		{#key videoId}
			<iframe
				class="yt"
				src={embedUrl(videoId)}
				title="background music"
				allow="autoplay; encrypted-media"
				frameborder="0"
			></iframe>
		{/key}
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		background: #000;
		color: #eee;
		overflow: hidden;
		font-family: ui-sans-serif, system-ui, sans-serif;
		color-scheme: only light;
		forced-color-adjust: none;
	}
	.host {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		background: #000;
	}

	.host.light {
		background: #ffffff !important;
		color: #000;
		color-scheme: only light;
		forced-color-adjust: none;
	}
	.lobby {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 4rem;
		text-align: center;
	}
	.lobby h1 {
		font-weight: 300;
		letter-spacing: 0.05em;
		font-size: 2rem;
		margin: 0;
	}
	.code {
		font-family: ui-monospace, monospace;
		font-size: 4rem;
		letter-spacing: 0.2em;
		color: #fff;
		display: block;
		margin-top: 0.5rem;
	}
	.muted {
		color: #888;
	}
	.small {
		font-size: 0.85rem;
	}
	.status {
		margin: 0;
		color: #aaa;
	}
	.status.photos {
		margin-top: 1.5rem;
	}
	.status.music.on {
		color: #6c6;
	}
	.preset-music {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
		justify-content: center;
	}
	.preset-select {
		padding: 0.6rem 1.2rem;
		border: 1px solid #444;
		background: #161616;
		color: #eee;
		border-radius: 6px;
		cursor: pointer;
		font: inherit;
	}
	button {
		padding: 0.6rem 1.2rem;
		border: 1px solid #444;
		background: #161616;
		color: #eee;
		border-radius: 6px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	button.primary {
		background: #e0e0e0;
		color: #000;
		border-color: #e0e0e0;
	}
	button.big {
		padding: 0.85rem 2rem;
		font-size: 1.05rem;
		margin-top: 1rem;
	}
	.slide {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
	}
	.host.light .slide {
		background: #ffffff !important;
	}
	.slide img,
	.slide video {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.host.light .slide img,
	.host.light .slide video {
		max-width: 80%;
		max-height: 80%;
	}
	.yt {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		pointer-events: none;
		z-index: 0;
	}
	.slide {
		z-index: 1;
	}
	.word-label {
		color: #888;
		margin: 0;
		font-size: 0.95rem;
		letter-spacing: 0.05em;
	}
	.word {
		color: #ddd;
		font-family: ui-monospace, monospace;
		font-weight: 500;
		letter-spacing: 0.1em;
	}
	.recover-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: center;
		min-width: 16rem;
	}
	.recover-input {
		padding: 0.6rem 0.8rem;
		background: #161616;
		color: #eee;
		border: 1px solid #444;
		border-radius: 6px;
		font-size: 1rem;
		width: 100%;
		text-align: center;
		font-family: ui-monospace, monospace;
	}
	.recover-actions {
		display: flex;
		gap: 0.5rem;
	}
	.recover-error {
		color: #d66;
		margin: 0;
		font-size: 0.9rem;
	}
	.lobby-links {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	.link-btn {
		background: transparent;
		border: none;
		color: #888;
		font-size: 0.85rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
	}
	.link-btn:hover {
		color: #ccc;
	}
</style>
