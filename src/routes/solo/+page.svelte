<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		addPhoto,
		clearAudio,
		deletePhoto,
		loadProject,
		saveYouTubeLink,
		saveOrder,
		saveSettings,
		setPhotoDuration,
		DEFAULT_SETTINGS,
		type AudioRecord,
		type PhotoRecord,
		type ProjectSettings
	} from '$lib/db';
	import { extractVideoId } from '$lib/youtube';

	let photos = $state<PhotoRecord[]>([]);
	let audio = $state<AudioRecord | undefined>(undefined);
	let settings = $state<ProjectSettings>({ ...DEFAULT_SETTINGS });
	let loading = $state(true);
	let dragId = $state<string | null>(null);
	let importing = $state(false);
	let youtubeInput = $state('');
	let ytStatus = $state<string | undefined>(undefined);

	const thumbCache = new Map<string, string>();
	function thumb(p: PhotoRecord): string {
		const cached = thumbCache.get(p.id);
		if (cached) return cached;
		const url = URL.createObjectURL(p.blob);
		thumbCache.set(p.id, url);
		return url;
	}

	onMount(async () => {
		const data = await loadProject();
		photos = data.photos;
		audio = data.audio;
		settings = data.settings;
		if (audio) youtubeInput = audio.youtubeUrl;
		loading = false;
	});

	onDestroy(() => {
		for (const url of thumbCache.values()) URL.revokeObjectURL(url);
	});

	async function onPhotoFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		importing = true;
		try {
			for (const file of Array.from(files)) {
				if (!file.type.startsWith('image/')) continue;
				const rec = await addPhoto(file);
				photos = [...photos, rec];
			}
		} finally {
			importing = false;
		}
	}

	async function saveYouTube() {
		const url = youtubeInput.trim();
		if (!url) {
			ytStatus = 'Enter a YouTube link';
			return;
		}
		if (!extractVideoId(url)) {
			ytStatus = "Couldn't parse a YouTube video ID from that link.";
			return;
		}
		audio = await saveYouTubeLink(url);
		ytStatus = 'Saved';
	}

	async function removeAudio() {
		await clearAudio();
		audio = undefined;
		youtubeInput = '';
		ytStatus = undefined;
	}

	async function onDelete(id: string) {
		await deletePhoto(id);
		photos = photos.filter((p) => p.id !== id);
		const url = thumbCache.get(id);
		if (url) {
			URL.revokeObjectURL(url);
			thumbCache.delete(id);
		}
	}

	async function onDurationChange(id: string, value: string) {
		const num = value === '' ? undefined : Number(value);
		await setPhotoDuration(id, num);
		photos = photos.map((p) => (p.id === id ? { ...p, duration: num } : p));
	}

	async function persistSettings() {
		await saveSettings(settings);
	}

	function onDragStart(id: string) {
		dragId = id;
	}
	async function onDrop(targetId: string) {
		if (!dragId || dragId === targetId) {
			dragId = null;
			return;
		}
		const from = photos.findIndex((p) => p.id === dragId);
		const to = photos.findIndex((p) => p.id === targetId);
		if (from < 0 || to < 0) return;
		const next = [...photos];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		photos = next;
		dragId = null;
		await saveOrder(next.map((p) => p.id));
	}
</script>

<svelte:head>
	<title>Film Lightbox</title>
</svelte:head>

<main>
	<header>
		<h1>Film Lightbox</h1>
		<p class="muted">A photo + music slideshow you can play on your TV.</p>
	</header>

	{#if loading}
		<p>Loading…</p>
	{:else}
		<section>
			<h2>1. Photos</h2>
			<label class="file-input">
				<input
					type="file"
					accept="image/*"
					multiple
					onchange={(e) => onPhotoFiles((e.currentTarget as HTMLInputElement).files)}
				/>
				<span>{importing ? 'Adding…' : 'Add photos'}</span>
			</label>

			{#if photos.length === 0}
				<p class="muted">No photos yet. Drag-drop or click above. Stored locally in your browser; you won't need to re-upload next time.</p>
			{:else}
				<div class="grid" role="list">
					{#each photos as p (p.id)}
						<div
							class="thumb"
							role="listitem"
							class:portrait={p.orientation === 'portrait'}
							draggable="true"
							ondragstart={() => onDragStart(p.id)}
							ondragover={(e) => e.preventDefault()}
							ondrop={() => onDrop(p.id)}
						>
							<img src={thumb(p)} alt="" />
							<div class="thumb-actions">
								<input
									type="number"
									min="0.5"
									step="0.5"
									placeholder="{settings.defaultDuration}s"
									value={p.duration ?? ''}
									onchange={(e) => onDurationChange(p.id, (e.currentTarget as HTMLInputElement).value)}
								/>
								<button onclick={() => onDelete(p.id)} aria-label="Delete">×</button>
							</div>
						</div>
					{/each}
				</div>
				<p class="muted">Drag tiles to reorder. Per-photo duration overrides the default.</p>
			{/if}
		</section>

		<section>
			<h2>2. Music (YouTube)</h2>
			<div class="youtube-send">
				<label>
					YouTube link — plays as background music in the slideshow
					<input type="url" placeholder="https://www.youtube.com/watch?v=…" bind:value={youtubeInput} />
				</label>
				<div class="row">
					<button onclick={saveYouTube} disabled={!youtubeInput || importing}>Save</button>
					{#if audio}
						<button onclick={removeAudio}>Remove</button>
					{/if}
				</div>
				{#if ytStatus}
					<p class="muted small">{ytStatus}</p>
				{/if}
				{#if audio && !ytStatus}
					<p class="muted small">Saved: {audio.youtubeUrl}</p>
				{/if}
			</div>
		</section>

		<section>
			<h2>3. Settings</h2>
			<div class="settings">
				<label>
					Default duration (s)
					<input
						type="number"
						min="0.5"
						step="0.5"
						bind:value={settings.defaultDuration}
						onchange={persistSettings}
					/>
				</label>
				<label>
					Crossfade (ms)
					<input
						type="number"
						min="0"
						step="50"
						bind:value={settings.transitionMs}
						onchange={persistSettings}
					/>
				</label>
				<label>
					<input type="checkbox" bind:checked={settings.pairPortraits} onchange={persistSettings} />
					Pair vertical photos side-by-side
				</label>
			</div>
		</section>

		<section class="actions">
			<a class="btn primary" class:disabled={photos.length === 0} href="/play">▶ Play fullscreen</a>
		</section>
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		background: #0a0a0a;
		color: #eee;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	main {
		max-width: 920px;
		margin: 0 auto;
		padding: 2rem 1.25rem 5rem;
	}
	header h1 {
		margin: 0;
		font-weight: 600;
		letter-spacing: 0.5px;
	}
	.muted {
		color: #888;
		font-size: 0.9rem;
	}
	.small {
		font-size: 0.85rem;
	}
	section {
		margin-top: 2.5rem;
	}
	h2 {
		font-size: 1.05rem;
		font-weight: 500;
		color: #aaa;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 0.75rem;
	}
	.file-input {
		display: inline-block;
		cursor: pointer;
	}
	.file-input input {
		display: none;
	}
	.file-input span {
		display: inline-block;
		padding: 0.55rem 1rem;
		border: 1px solid #333;
		border-radius: 6px;
		background: #161616;
	}
	.file-input span:hover {
		background: #1f1f1f;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		background: #111;
		border: 1px solid #222;
		border-radius: 4px;
		overflow: hidden;
		cursor: grab;
	}
	.thumb.portrait {
		aspect-ratio: 3 / 4;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb-actions {
		position: absolute;
		inset: auto 0 0 0;
		display: flex;
		gap: 4px;
		padding: 4px;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent);
	}
	.thumb-actions input {
		flex: 1;
		min-width: 0;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid #333;
		color: #eee;
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 0.75rem;
	}
	.thumb-actions button {
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid #333;
		color: #eee;
		width: 26px;
		border-radius: 3px;
		cursor: pointer;
	}
	.youtube-send {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 480px;
	}
	.youtube-send label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: #aaa;
	}
	.youtube-send input {
		background: #111;
		border: 1px solid #333;
		color: #eee;
		padding: 0.5rem;
		border-radius: 4px;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.row button {
		background: #1f1f1f;
		border: 1px solid #333;
		color: #eee;
		padding: 0.4rem 0.9rem;
		border-radius: 4px;
		cursor: pointer;
	}
	.row button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.settings {
		display: grid;
		gap: 0.75rem;
		max-width: 320px;
	}
	.settings label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.settings input[type='number'] {
		width: 100px;
		background: #161616;
		border: 1px solid #333;
		color: #eee;
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
	}
	.actions {
		margin-top: 3rem;
	}
	.btn {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		text-decoration: none;
		font-weight: 500;
	}
	.btn.primary {
		background: #e0e0e0;
		color: #0a0a0a;
	}
	.btn.disabled {
		opacity: 0.4;
		pointer-events: none;
	}
</style>
