export function extractVideoId(input: string): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
	try {
		const url = new URL(trimmed);
		if (url.hostname === 'youtu.be') {
			const id = url.pathname.slice(1);
			return /^[\w-]{11}$/.test(id) ? id : null;
		}
		if (/(^|\.)youtube\.com$/.test(url.hostname)) {
			if (url.pathname === '/watch') {
				const v = url.searchParams.get('v');
				return v && /^[\w-]{11}$/.test(v) ? v : null;
			}
			const m = url.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
			if (m) return m[2];
		}
	} catch {
		/* not a URL */
	}
	return null;
}

export function embedUrl(videoId: string): string {
	const params = new URLSearchParams({
		autoplay: '1',
		loop: '1',
		playlist: videoId,
		controls: '0',
		modestbranding: '1',
		rel: '0',
		playsinline: '1'
	});
	return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
