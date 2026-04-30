<script lang="ts">
	// landing
</script>

<svelte:head>
	<title>Film Lightbox</title>
</svelte:head>

<main>
	<header>
		<h1>Film Lightbox</h1>
		<p class="muted">A photo + music slideshow for your TV.</p>
	</header>

	<section class="modes">
		<a class="mode" href="/host">
			<h2>📺 Host on TV</h2>
			<p>Open this on the TV. Get a 6-digit room code. Friends upload photos from their phones.</p>
		</a>

		<a class="mode" href="/upload">
			<h2>📱 Upload from phone</h2>
			<p>Enter the room code shown on the TV. Pick photos. They appear in the slideshow.</p>
		</a>

		<a class="mode" href="/solo">
			<h2>👤 Solo (offline)</h2>
			<p>One device, no internet, no Supabase. Photos stay in this browser. Best for personal use.</p>
		</a>
	</section>
</main>

<style>
	:global(html, body) {
		margin: 0;
		background: #0a0a0a;
		color: #eee;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 4rem 1.25rem;
	}
	h1 {
		font-weight: 300;
		letter-spacing: 0.05em;
		margin: 0 0 0.25rem;
	}
	.muted {
		color: #888;
	}
	.modes {
		display: grid;
		gap: 1rem;
		margin-top: 3rem;
	}
	.mode {
		display: block;
		padding: 1.25rem 1.5rem;
		background: #111;
		border: 1px solid #222;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
	}
	.mode:hover {
		background: #161616;
		border-color: #333;
	}
	.mode h2 {
		margin: 0 0 0.4rem;
		font-size: 1.05rem;
		font-weight: 500;
	}
	.mode p {
		margin: 0;
		color: #888;
		font-size: 0.9rem;
	}
</style>
