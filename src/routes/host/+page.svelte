<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { generateRoomCode } from '$lib/roomCode';
	import { getSupabase, roomFolder, SUPABASE_BUCKET } from '$lib/supabase';
	import { extractVideoId, embedUrl } from '$lib/youtube';

	const SLIDE_MS = 5000;
	const TRANSITION_MS = 800;

	let code = $state('');
	let queue = $state<{ name: string; url: string }[]>([]);
	let started = $state(false);
	let currentIndex = $state(0);
	let nextIndex = $state<number | null>(null);
	let transitionAt = $state(0);
	let youtubeInput = $state('');
	let videoId = $state<string | undefined>(undefined);
	let youtubeStatus = $state<string | undefined>(undefined);
	let containerEl: HTMLDivElement | undefined = $state();

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let rafId: number | null = null;
	let lastAdvance = 0;
	const seen = new Set<string>();

	async function listExisting() {
		const supa = getSupabase();
		const { data, error } = await supa.storage
			.from(SUPABASE_BUCKET)
			.list(roomFolder(code), { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
		if (error) {
			console.warn('list failed', error);
			return;
		}
		for (const f of data ?? []) addFile(f.name);
	}

	function addFile(name: string) {
		const path = `${roomFolder(code)}/${name}`;
		if (seen.has(path)) return;
		seen.add(path);
		const supa = getSupabase();
		const { data } = supa.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
		queue = [...queue, { name, url: data.publicUrl }];
	}

	function startPolling() {
		pollTimer = setInterval(listExisting, 3000);
	}

	function tick() {
		rafId = requestAnimationFrame(tick);
		if (!started || queue.length === 0) return;
		const now = performance.now();
		if (nextIndex === null) {
			if (now - lastAdvance >= SLIDE_MS && queue.length > 1) {
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

	function loadYouTube() {
		const id = extractVideoId(youtubeInput);
		if (!id) {
			youtubeStatus = 'Could not parse a YouTube video ID from that.';
			videoId = undefined;
			return;
		}
		videoId = id;
		youtubeStatus = `Ready: ${id}`;
	}

	function exitFullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen();
		started = false;
	}

	function onKey(e: KeyboardEvent) {
		if (!started) return;
		if (e.key === 'Escape') exitFullscreen();
		if (e.key === 'ArrowRight' && queue.length > 1) {
			currentIndex = (currentIndex + 1) % queue.length;
			nextIndex = null;
			lastAdvance = performance.now();
		}
		if (e.key === 'ArrowLeft' && queue.length > 1) {
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

<div class="host" bind:this={containerEl}>
	{#if !started}
		<div class="lobby">
			<h1>Room <span class="code">{code}</span></h1>
			<p class="muted">
				On your phone: open this site → "Upload from phone" → enter code <strong>{code}</strong>
			</p>

			<div class="audio-box">
				<label>
					YouTube link (optional — plays as background music)
					<input
						type="url"
						placeholder="https://www.youtube.com/watch?v=…"
						bind:value={youtubeInput}
					/>
				</label>
				<button onclick={loadYouTube} disabled={!youtubeInput}>Load YouTube</button>
				{#if youtubeStatus}
					<p class="muted small">{youtubeStatus}</p>
				{/if}
			</div>

			<p class="queue-status">
				{queue.length} photo{queue.length === 1 ? '' : 's'} ready
			</p>
			<button class="primary big" onclick={start} disabled={queue.length === 0}>
				▶ Start slideshow
			</button>
			<p class="muted small">→ ← navigate · esc exit fullscreen</p>
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
					<img src={item.url} alt="" />
				</div>
			{/if}
		{/each}
	{/if}

	{#if started && videoId}
		<iframe
			class="yt"
			src={embedUrl(videoId)}
			title="background music"
			allow="autoplay; encrypted-media"
			frameborder="0"
		></iframe>
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
	.lobby {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 2rem;
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
	.audio-box {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 480px;
		width: 100%;
	}
	.audio-box label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: left;
		font-size: 0.85rem;
		color: #aaa;
	}
	.audio-box input {
		background: #111;
		border: 1px solid #333;
		color: #eee;
		padding: 0.5rem;
		border-radius: 4px;
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
	.queue-status {
		margin-top: 1.5rem;
		color: #aaa;
	}
	.slide {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
	}
	.slide img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
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
