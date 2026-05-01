<script lang="ts">
	import { isValidCode } from '$lib/roomCode';
	import { resizeForTV } from '$lib/resizeImage';
	import { getSupabase, roomFolder, SUPABASE_BUCKET } from '$lib/supabase';
	import { extractVideoId } from '$lib/youtube';

	type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';
	interface UploadEntry { name: string; status: UploadStatus; error?: string }
	type MusicState = 'idle' | 'saving' | 'saved' | 'error';

	const MUSIC_FILE = 'youtube.txt';

	let code = $state('');
	let joined = $state(false);
	let uploads = $state<UploadEntry[]>([]);
	let globalError = $state<string | undefined>(undefined);

	let youtubeInput = $state('');
	let musicState = $state<MusicState>('idle');
	let musicMessage = $state<string | undefined>(undefined);
	let musicHasSaved = $state(false);

	function join() {
		if (!isValidCode(code)) return;
		joined = true;
		void loadCurrentMusic();
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

		for (const file of Array.from(files)) {
			if (!file.type.startsWith('image/')) continue;
			const entry: UploadEntry = { name: file.name, status: 'uploading' };
			uploads = [...uploads, entry];
			try {
				const resized = await resizeForTV(file);
				const stamp = Date.now().toString(36);
				const rand = Math.random().toString(36).slice(2, 8);
				const path = `${roomFolder(code)}/${stamp}_${rand}.jpg`;
				const { error } = await supa.storage
					.from(SUPABASE_BUCKET)
					.upload(path, resized.blob, { contentType: resized.mimeType, upsert: false });
				if (error) {
					entry.status = 'error';
					entry.error = error.message;
				} else {
					entry.status = 'done';
				}
			} catch (e) {
				entry.status = 'error';
				entry.error = e instanceof Error ? e.message : String(e);
			}
			uploads = [...uploads];
		}
		if (inputEl) inputEl.value = '';
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
			<h2>Photos</h2>
			<p class="muted">Pick photos. They'll show on the TV automatically.</p>
			<label class="file-input">
				<input
					type="file"
					accept="image/*"
					multiple
					onchange={(e) => {
						const el = e.currentTarget as HTMLInputElement;
						onFiles(el.files, el);
					}}
				/>
				<span>Choose photos</span>
			</label>

			{#if globalError}
				<p class="global-error">⚠ {globalError}</p>
			{/if}

			{#if uploads.length > 0}
				<ul class="uploads">
					{#each uploads as u, i (i)}
						<li class={u.status}>
							<span class="name">{u.name}</span>
							<span class="status">
								{#if u.status === 'uploading'}…{/if}
								{#if u.status === 'done'}✓{/if}
								{#if u.status === 'error'}✗ {u.error ?? ''}{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="block">
			<h2>Background music</h2>
			<p class="muted">Paste a YouTube link. It'll play behind the slideshow on the TV.</p>
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
					{musicState === 'saving' ? 'Sending…' : musicHasSaved ? 'Update' : 'Send to TV'}
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
	.file-input {
		display: block;
		cursor: pointer;
		margin: 1rem 0;
	}
	.file-input input {
		display: none;
	}
	.file-input span {
		display: block;
		text-align: center;
		padding: 1rem;
		border: 1px dashed #444;
		border-radius: 6px;
		background: #111;
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
	.uploads {
		list-style: none;
		padding: 0;
		margin-top: 1.5rem;
	}
	.uploads li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid #1f1f1f;
		font-size: 0.9rem;
	}
	.uploads li.done .status {
		color: #6c6;
	}
	.uploads li.error .status {
		color: #d66;
	}
	.uploads li.uploading .status {
		color: #aaa;
	}
	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
