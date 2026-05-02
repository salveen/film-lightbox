<script lang="ts">
	import { isValidCode } from '$lib/roomCode';
	import { resizeForTV } from '$lib/resizeImage';
	import { processVideo } from '$lib/processVideo';
	import { getSupabase, roomFolder, SUPABASE_BUCKET } from '$lib/supabase';
	import { extractVideoId } from '$lib/youtube';

	type ItemStatus = 'processing' | 'uploading' | 'done' | 'error';
	type Kind = 'image' | 'video';
	interface RoomItem {
		id: string;
		label: string;
		storageName?: string;
		kind: Kind;
		url?: string;
		status: ItemStatus;
		progress?: number;
		error?: string;
	}
	type MusicState = 'idle' | 'saving' | 'saved' | 'error';

	const MUSIC_FILE = 'youtube.txt';
	const ORDER_FILE = 'order.txt';

	function classifyExt(name: string): Kind | null {
		const lower = name.toLowerCase();
		if (/\.(jpe?g|png|webp|gif|avif)$/.test(lower)) return 'image';
		if (/\.(webm|mp4|mov|m4v|ogv)$/.test(lower)) return 'video';
		return null;
	}

	let code = $state('');
	let joined = $state(false);
	let items = $state<RoomItem[]>([]);
	let globalError = $state<string | undefined>(undefined);

	let youtubeInput = $state('');
	let musicState = $state<MusicState>('idle');
	let musicMessage = $state<string | undefined>(undefined);
	let musicHasSaved = $state(false);

	function join() {
		if (!isValidCode(code)) return;
		joined = true;
		void loadCurrentMusic();
		void loadRoomItems();
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

	async function writeOrder() {
		const supa = getSupabase();
		const path = `${roomFolder(code)}/${ORDER_FILE}`;
		const names = items.filter((i) => i.storageName).map((i) => i.storageName!);
		const blob = new Blob([names.join('\n')], { type: 'text/plain' });
		await supa.storage
			.from(SUPABASE_BUCKET)
			.upload(path, blob, { contentType: 'text/plain', upsert: true });
	}

	async function loadRoomItems() {
		try {
			const supa = getSupabase();
			const folder = roomFolder(code);
			const { data: list } = await supa.storage
				.from(SUPABASE_BUCKET)
				.list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
			if (!list) return;

			const validNames = list.map((f) => f.name).filter((n) => classifyExt(n) !== null);
			const order = await readOrder();
			const inOrder = order.filter((n) => validNames.includes(n));
			const remaining = validNames.filter((n) => !order.includes(n));
			const ordered = [...inOrder, ...remaining];

			items = ordered.map((name) => {
				const { data: pub } = supa.storage
					.from(SUPABASE_BUCKET)
					.getPublicUrl(`${folder}/${name}`);
				return {
					id: name,
					label: name,
					storageName: name,
					kind: classifyExt(name)!,
					url: pub.publicUrl,
					status: 'done' as ItemStatus
				};
			});
		} catch (e) {
			console.warn('loadRoomItems failed', e);
		}
	}

	async function deleteItem(id: string) {
		const item = items.find((i) => i.id === id);
		if (!item) return;
		if (item.storageName) {
			try {
				const supa = getSupabase();
				await supa.storage
					.from(SUPABASE_BUCKET)
					.remove([`${roomFolder(code)}/${item.storageName}`]);
			} catch (e) {
				globalError = e instanceof Error ? e.message : String(e);
				return;
			}
		}
		items = items.filter((i) => i.id !== id);
		if (item.storageName) await writeOrder();
	}

	async function moveItem(id: string, dir: -1 | 1) {
		const idx = items.findIndex((i) => i.id === id);
		if (idx < 0) return;
		const newIdx = idx + dir;
		if (newIdx < 0 || newIdx >= items.length) return;
		const next = [...items];
		[next[idx], next[newIdx]] = [next[newIdx], next[idx]];
		items = next;
		await writeOrder();
	}

	async function loadCurrentMusic() {
		try {
			const supa = getSupabase();
			const { data: pub } = supa.storage
				.from(SUPABASE_BUCKET)
				.getPublicUrl(`${roomFolder(code)}/${MUSIC_FILE}`);
			const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`);
			if (!res.ok) return;
			const txt = (await res.text()).trim();
			if (txt) {
				youtubeInput = txt;
				musicHasSaved = true;
			}
		} catch {
			/* no existing music; ignore */
		}
	}

	async function saveMusic() {
		const url = youtubeInput.trim();
		if (!url) {
			musicState = 'error';
			musicMessage = 'Paste a YouTube link first.';
			return;
		}
		if (!extractVideoId(url)) {
			musicState = 'error';
			musicMessage = "Couldn't parse a YouTube video ID from that link.";
			return;
		}
		musicState = 'saving';
		musicMessage = undefined;
		try {
			const supa = getSupabase();
			const path = `${roomFolder(code)}/${MUSIC_FILE}`;
			const blob = new Blob([url], { type: 'text/plain' });
			const { error } = await supa.storage
				.from(SUPABASE_BUCKET)
				.upload(path, blob, { contentType: 'text/plain', upsert: true });
			if (error) {
				musicState = 'error';
				musicMessage = error.message;
				return;
			}
			musicState = 'saved';
			musicMessage = '✓ Music sent to the TV';
			musicHasSaved = true;
		} catch (e) {
			musicState = 'error';
			musicMessage = e instanceof Error ? e.message : String(e);
		}
	}

	async function clearMusic() {
		musicState = 'saving';
		musicMessage = undefined;
		try {
			const supa = getSupabase();
			const path = `${roomFolder(code)}/${MUSIC_FILE}`;
			const { error } = await supa.storage.from(SUPABASE_BUCKET).remove([path]);
			if (error) {
				musicState = 'error';
				musicMessage = error.message;
				return;
			}
			musicState = 'idle';
			musicMessage = 'Music cleared';
			musicHasSaved = false;
			youtubeInput = '';
		} catch (e) {
			musicState = 'error';
			musicMessage = e instanceof Error ? e.message : String(e);
		}
	}

	async function onFiles(files: FileList | null, inputEl?: HTMLInputElement) {
		globalError = undefined;
		if (!files || files.length === 0) return;

		let supa;
		try {
			supa = getSupabase();
		} catch (e) {
			globalError = e instanceof Error ? e.message : String(e);
			return;
		}

		const tasks = Array.from(files)
			.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
			.map((file) => {
				const isImage = file.type.startsWith('image/');
				const id = `tmp_${Math.random().toString(36).slice(2)}`;
				const initial: RoomItem = {
					id,
					label: file.name,
					kind: isImage ? 'image' : 'video',
					status: 'processing'
				};
				items = [...items, initial];
				let currentId = id;
				const update = (patch: Partial<RoomItem>) => {
					items = items.map((i) => (i.id === currentId ? { ...i, ...patch } : i));
					if (patch.id) currentId = patch.id;
				};
				return { file, isImage, update };
			});

		const CONCURRENCY = 3;
		let cursor = 0;
		const worker = async () => {
			while (true) {
				const next = cursor++;
				if (next >= tasks.length) return;
				const { file, isImage, update } = tasks[next];
				try {
					const stamp = Date.now().toString(36);
					const rand = Math.random().toString(36).slice(2, 8);

					let blob: Blob;
					let contentType: string;
					let ext: string;

					if (isImage) {
						const resized = await resizeForTV(file);
						blob = resized.blob;
						contentType = resized.mimeType;
						ext = 'jpg';
					} else {
						const processed = await processVideo(file, (frac) => {
							update({ progress: frac });
						});
						blob = processed.blob;
						contentType = processed.mimeType;
						ext = processed.ext;
					}

					update({ status: 'uploading', progress: undefined });

					const storageName = `${stamp}_${rand}.${ext}`;
					const path = `${roomFolder(code)}/${storageName}`;
					const { error } = await supa.storage
						.from(SUPABASE_BUCKET)
						.upload(path, blob, { contentType, upsert: false });
					if (error) {
						update({ status: 'error', error: error.message });
					} else {
						const { data: pub } = supa.storage
							.from(SUPABASE_BUCKET)
							.getPublicUrl(path);
						update({
							id: storageName,
							storageName,
							url: pub.publicUrl,
							status: 'done'
						});
					}
				} catch (e) {
					update({ status: 'error', error: e instanceof Error ? e.message : String(e) });
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
		if (inputEl) inputEl.value = '';
		await writeOrder();
	}
</script>

<svelte:head>
	<title>Upload — Film Lightbox</title>
</svelte:head>

<main>
	{#if !joined}
		<h1>Join a room</h1>
		<p class="muted">Enter the 6-digit code shown on the TV.</p>
		<input
			type="tel"
			inputmode="numeric"
			maxlength="6"
			pattern="\d{6}"
			placeholder="000000"
			bind:value={code}
			class="code-input"
		/>
		<button class="primary" disabled={!isValidCode(code)} onclick={join}>Join</button>
	{:else}
		<h1>Room <span class="code">{code}</span></h1>

		<section class="block">
			<h2>Photos & videos</h2>
			<p class="muted">
				Videos over 1080p are compressed in your browser before upload — that takes about as long as
				the clip itself.
			</p>
			<div class="pick-row">
				<label class="pick-btn">
					<input
						type="file"
						accept="image/*"
						multiple
						onchange={(e) => {
							const el = e.currentTarget as HTMLInputElement;
							onFiles(el.files, el);
						}}
					/>
					<span>📷 Add photos</span>
				</label>
				<label class="pick-btn">
					<input
						type="file"
						accept="video/*"
						multiple
						onchange={(e) => {
							const el = e.currentTarget as HTMLInputElement;
							onFiles(el.files, el);
						}}
					/>
					<span>🎬 Add videos</span>
				</label>
			</div>

			{#if globalError}
				<p class="global-error">⚠ {globalError}</p>
			{/if}

			{#if items.length > 0}
				<ul class="items">
					{#each items as item, i (item.id)}
						<li class={item.status}>
							<div class="thumb-wrap">
								{#if item.url && item.kind === 'image'}
									<img class="thumb" src={item.url} alt="" />
								{:else if item.url && item.kind === 'video'}
									<!-- svelte-ignore a11y_media_has_caption -->
									<video class="thumb" src={item.url} preload="metadata" muted></video>
								{:else}
									<div class="thumb thumb-placeholder">
										{item.kind === 'video' ? '🎬' : '📷'}
									</div>
								{/if}
							</div>
							<div class="info">
								<span class="name">{item.label}</span>
								{#if item.status !== 'done'}
									<span class="status">
										{#if item.status === 'processing' && item.progress !== undefined}
											compressing {Math.round(item.progress * 100)}%
										{:else if item.status === 'processing' || item.status === 'uploading'}
											uploading…
										{:else if item.status === 'error'}
											✗ {item.error ?? ''}
										{/if}
									</span>
								{/if}
							</div>
							{#if item.status === 'done'}
								<div class="controls">
									<button
										class="ctrl"
										disabled={i === 0}
										onclick={() => moveItem(item.id, -1)}
										aria-label="Move up">↑</button
									>
									<button
										class="ctrl"
										disabled={i === items.length - 1}
										onclick={() => moveItem(item.id, 1)}
										aria-label="Move down">↓</button
									>
									<button
										class="ctrl danger"
										onclick={() => deleteItem(item.id)}
										aria-label="Delete">✕</button
									>
								</div>
							{:else if item.status === 'error'}
								<div class="controls">
									<button
										class="ctrl danger"
										onclick={() => (items = items.filter((x) => x.id !== item.id))}
										aria-label="Dismiss">✕</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="block">
			<h2>Background music</h2>
			<p class="muted">Paste the link to your favourite track or playlist on YouTube — it'll play as background music during the slideshow.</p>
			<input
				type="url"
				inputmode="url"
				autocomplete="off"
				autocapitalize="off"
				autocorrect="off"
				spellcheck="false"
				placeholder="https://www.youtube.com/watch?v=…"
				bind:value={youtubeInput}
				class="url-input"
			/>
			<div class="row">
				<button
					class="primary"
					onclick={saveMusic}
					disabled={!youtubeInput.trim() || musicState === 'saving'}
				>
					{musicState === 'saving' ? 'Sending…' : musicHasSaved ? 'Update' : 'Send to host'}
				</button>
				{#if musicHasSaved}
					<button class="secondary" onclick={clearMusic} disabled={musicState === 'saving'}>
						Remove
					</button>
				{/if}
			</div>
			{#if musicMessage}
				<p class="music-msg" class:error={musicState === 'error'}>{musicMessage}</p>
			{/if}
		</section>
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		background: #0a0a0a;
		color: #eee;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	main {
		max-width: 480px;
		margin: 0 auto;
		padding: 2rem 1.25rem 5rem;
	}
	h1 {
		font-weight: 400;
		letter-spacing: 0.05em;
	}
	h2 {
		font-size: 0.8rem;
		font-weight: 500;
		color: #aaa;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		margin: 0 0 0.5rem;
	}
	.block {
		margin-top: 2rem;
	}
	.muted {
		color: #888;
		font-size: 0.9rem;
	}
	.code {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.2em;
		color: #fff;
	}
	.code-input {
		display: block;
		width: 100%;
		font-size: 2rem;
		font-family: ui-monospace, monospace;
		text-align: center;
		letter-spacing: 0.5em;
		background: #111;
		border: 1px solid #333;
		color: #fff;
		padding: 0.6rem;
		border-radius: 6px;
		margin: 1rem 0;
		box-sizing: border-box;
	}
	.url-input {
		display: block;
		width: 100%;
		font-size: 0.95rem;
		background: #111;
		border: 1px solid #333;
		color: #eee;
		padding: 0.7rem;
		border-radius: 6px;
		margin: 0.75rem 0 0.5rem;
		box-sizing: border-box;
	}
	button {
		padding: 0.7rem 1.5rem;
		border: 1px solid #444;
		background: #161616;
		color: #eee;
		border-radius: 6px;
		cursor: pointer;
		font-size: 1rem;
		width: 100%;
	}
	button.primary {
		background: #e0e0e0;
		color: #000;
		border-color: #e0e0e0;
	}
	button.secondary {
		background: #1f1f1f;
	}
	button:disabled {
		opacity: 0.4;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.pick-row {
		display: flex;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	.pick-btn {
		flex: 1;
		display: block;
		cursor: pointer;
	}
	.pick-btn input {
		display: none;
	}
	.pick-btn span {
		display: block;
		text-align: center;
		padding: 1rem 0.5rem;
		border: 1px dashed #444;
		border-radius: 6px;
		background: #111;
		font-size: 0.95rem;
	}
	.pick-btn:hover span {
		background: #161616;
		border-color: #555;
	}
	.global-error {
		background: #2a1414;
		border: 1px solid #5a2a2a;
		color: #ff9b9b;
		padding: 0.6rem 0.8rem;
		border-radius: 4px;
		font-size: 0.85rem;
	}
	.music-msg {
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: #6c6;
	}
	.music-msg.error {
		color: #d66;
	}
	.items {
		list-style: none;
		padding: 0;
		margin-top: 1.5rem;
	}
	.items li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid #1f1f1f;
		font-size: 0.9rem;
	}
	.thumb-wrap {
		flex: 0 0 auto;
	}
	.thumb {
		width: 44px;
		height: 44px;
		object-fit: cover;
		border-radius: 4px;
		background: #111;
		display: block;
	}
	.thumb-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.items li.error .status {
		color: #d66;
	}
	.items li.uploading .status,
	.items li.processing .status {
		color: #aaa;
		font-size: 0.8rem;
	}
	.controls {
		display: flex;
		gap: 0.25rem;
		flex: 0 0 auto;
	}
	.ctrl {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 0.95rem;
		line-height: 1;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		color: #ccc;
		border-radius: 4px;
		cursor: pointer;
	}
	.ctrl:hover:not(:disabled) {
		background: #222;
		color: #fff;
	}
	.ctrl:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.ctrl.danger:hover:not(:disabled) {
		background: #3a1818;
		border-color: #5a2a2a;
		color: #ff9b9b;
	}
</style>
