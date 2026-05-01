<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { generateRoomCode } from '$lib/roomCode';
	import { getSupabase, roomFolder, SUPABASE_BUCKET } from '$lib/supabase';
	import { extractVideoId, embedUrl } from '$lib/youtube';

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
			const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`);
			if (!res.ok) return [];
			return (await res.text())
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	let code = $state('');
	let queue = $state<SlideItem[]>([]);
	let started = $state(false);
	let currentIndex = $state(0);
	let nextIndex = $state<number | null>(null);
	let transitionAt = $state(0);
	let videoId = $state<string | undefined>(undefined);
	let paused = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let rafId: number | null = null;
	let lastAdvance = 0;
	let lastMusicSig: string | undefined;

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

		const validNames = files.map((f) => f.name).filter((n) => classify(n) !== null);
		const order = await readOrder();
		const inOrder = order.filter((n) => validNames.includes(n));
		const remaining = validNames.filter((n) => !order.includes(n));
		const ordered = [...inOrder, ...remaining];

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
		pollTimer = setInterval(listExisting, 3000);
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

	onMount(() => {
		code = generateRoomCode();
		listExisting();
		startPolling();
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (rafId !== null) cancelAnimationFrame(rafId);
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
			<h1>Room <span class="code">{code}</span></h1>
			<p class="muted">
				On your phone: open this site → "Upload from phone" → enter code <strong>{code}</strong>
			</p>

			<p class="status photos">
				{queue.length} item{queue.length === 1 ? '' : 's'} ready
			</p>
			<p class="status music" class:on={!!videoId}>
				{videoId ? '🎵 Music linked from phone' : '🎵 No music yet — add a YouTube link from your phone'}
			</p>

			<button class="primary big" onclick={start} disabled={queue.length === 0}>
				▶ Start slideshow
			</button>
			<p class="muted small">→ ← navigate · space pause · f fullscreen · esc exit</p>
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
	}
	.host {
		position: fixed;
		inset: 0;
		background: #000;
	}

	.host.light {
		background: #fff;
		color: #000;
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
	.slide img,
	.slide video {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.host.light .slide {
		background: #fff;
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
</style>
