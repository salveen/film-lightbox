<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { loadProject, type AudioRecord, type PhotoRecord, type ProjectSettings } from '$lib/db';
	import { buildSlides, type Slide } from '$lib/slides';

	let photos: PhotoRecord[] = [];
	let audio = $state<AudioRecord | undefined>(undefined);
	let settings: ProjectSettings | undefined;
	let slides = $state<Slide[]>([]);
	let urlMap = new Map<string, string>();
	let audioUrl = $state<string | undefined>(undefined);

	let currentIndex = $state(0);
	let nextIndex = $state<number | null>(null);
	let transitionProgress = $state(0);
	let started = $state(false);
	let paused = $state(false);
	let error = $state<string | undefined>(undefined);

	let audioEl: HTMLAudioElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();

	let rafId: number | null = null;
	let slideStartedAt = 0;
	let transitionStartedAt: number | null = null;

	function urlFor(p: PhotoRecord): string {
		const cached = urlMap.get(p.id);
		if (cached) return cached;
		const u = URL.createObjectURL(p.blob);
		urlMap.set(p.id, u);
		return u;
	}

	onMount(async () => {
		const data = await loadProject();
		if (data.photos.length === 0) {
			error = 'No photos. Add some on the editor first.';
			return;
		}
		photos = data.photos;
		audio = data.audio;
		settings = data.settings;
		slides = buildSlides(photos, settings.defaultDuration, settings.pairPortraits);
		if (audio) {
			audioUrl = URL.createObjectURL(audio.blob);
		}
	});

	onDestroy(() => {
		if (rafId !== null) cancelAnimationFrame(rafId);
		for (const u of urlMap.values()) URL.revokeObjectURL(u);
		if (audioUrl) URL.revokeObjectURL(audioUrl);
	});

	async function start() {
		started = true;
		slideStartedAt = performance.now();
		if (audioEl) {
			try {
				await audioEl.play();
			} catch (e) {
				console.warn('Audio play failed', e);
			}
		}
		if (containerEl && containerEl.requestFullscreen) {
			try {
				await containerEl.requestFullscreen();
			} catch {
				/* ignore */
			}
		}
		tick();
	}

	function tick() {
		rafId = requestAnimationFrame(tick);
		if (!started || paused || slides.length === 0 || !settings) return;

		const now = performance.now();
		const slide = slides[currentIndex];
		const transitionMs = settings.transitionMs;

		if (transitionStartedAt === null) {
			if (now - slideStartedAt >= slide.duration * 1000) {
				nextIndex = (currentIndex + 1) % slides.length;
				transitionStartedAt = now;
			}
		} else {
			const t = (now - transitionStartedAt) / Math.max(1, transitionMs);
			if (t >= 1) {
				currentIndex = nextIndex!;
				nextIndex = null;
				transitionStartedAt = null;
				transitionProgress = 0;
				slideStartedAt = now;
			} else {
				transitionProgress = t;
			}
		}
	}

	function exit() {
		if (document.fullscreenElement) {
			void document.exitFullscreen();
		}
		void goto('/');
	}

	function nextSlide() {
		if (slides.length === 0) return;
		currentIndex = (currentIndex + 1) % slides.length;
		nextIndex = null;
		transitionStartedAt = null;
		transitionProgress = 0;
		slideStartedAt = performance.now();
	}
	function prevSlide() {
		if (slides.length === 0) return;
		currentIndex = (currentIndex - 1 + slides.length) % slides.length;
		nextIndex = null;
		transitionStartedAt = null;
		transitionProgress = 0;
		slideStartedAt = performance.now();
	}

	function onKey(e: KeyboardEvent) {
		if (!started) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				void start();
			}
			return;
		}
		if (e.key === 'ArrowRight') nextSlide();
		else if (e.key === 'ArrowLeft') prevSlide();
		else if (e.key === ' ') {
			e.preventDefault();
			paused = !paused;
			if (paused) audioEl?.pause();
			else void audioEl?.play();
		} else if (e.key === 'Escape') exit();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="player" bind:this={containerEl}>
	{#if error}
		<div class="overlay">
			<p>{error}</p>
			<button onclick={() => goto('/')}>Back to editor</button>
		</div>
	{:else if !started}
		<div class="overlay">
			<h1>Film Lightbox</h1>
			<p class="muted">{slides.length} slide{slides.length === 1 ? '' : 's'}{audio ? ' · audio loaded' : ' · no audio'}</p>
			<button class="primary" onclick={start}>▶ Start</button>
			<p class="hint muted">→ next · ← previous · space pause · esc exit</p>
		</div>
	{:else}
		{#each slides as slide, i (i)}
			{#if i === currentIndex || i === nextIndex}
				<div
					class="slide"
					style:opacity={i === currentIndex
						? nextIndex === null
							? 1
							: 1 - transitionProgress
						: transitionProgress}
				>
					{#if slide.kind === 'single'}
						<img src={urlFor(slide.photo)} alt="" />
					{:else}
						<div class="pair">
							<img src={urlFor(slide.left)} alt="" />
							<img src={urlFor(slide.right)} alt="" />
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	{/if}

	{#if audioUrl}
		<audio bind:this={audioEl} src={audioUrl} loop preload="auto"></audio>
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		background: #000;
		color: #eee;
		overflow: hidden;
	}
	.player {
		position: fixed;
		inset: 0;
		background: #000;
		cursor: none;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		text-align: center;
		cursor: default;
	}
	.overlay h1 {
		font-weight: 300;
		letter-spacing: 0.1em;
	}
	.muted {
		color: #888;
	}
	.hint {
		font-size: 0.85rem;
		margin-top: 2rem;
	}
	button {
		padding: 0.75rem 2rem;
		font-size: 1rem;
		border: 1px solid #444;
		background: #111;
		color: #eee;
		border-radius: 6px;
		cursor: pointer;
	}
	button.primary {
		background: #e0e0e0;
		color: #000;
		border-color: #e0e0e0;
	}
	.slide {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: none;
	}
	.slide img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.pair {
		display: flex;
		gap: 1.5vw;
		width: 100%;
		height: 100%;
		align-items: center;
		justify-content: center;
		padding: 2vh 2vw;
		box-sizing: border-box;
	}
	.pair img {
		max-width: 48%;
		max-height: 100%;
		object-fit: contain;
	}
	audio {
		display: none;
	}
</style>
