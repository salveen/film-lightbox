const MAX_W = 1920;
const MAX_H = 1080;
const VIDEO_BITRATE = 4_000_000;
const FPS = 30;

export interface ProcessedVideo {
	blob: Blob;
	mimeType: string;
	ext: string;
	width: number;
	height: number;
	duration: number;
	transcoded: boolean;
}

interface VideoMeta {
	width: number;
	height: number;
	duration: number;
}

function loadVideoMeta(file: File): Promise<{ video: HTMLVideoElement; meta: VideoMeta }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.preload = 'auto';
		video.src = URL.createObjectURL(file);
		video.muted = false;
		video.playsInline = true;
		video.onloadedmetadata = () => {
			resolve({
				video,
				meta: {
					width: video.videoWidth,
					height: video.videoHeight,
					duration: video.duration
				}
			});
		};
		video.onerror = () => reject(new Error("Couldn't read this video file."));
	});
}

function pickMimeType(): string {
	const candidates = [
		'video/webm;codecs=vp9,opus',
		'video/webm;codecs=vp8,opus',
		'video/webm'
	];
	for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
	return 'video/webm';
}

export async function processVideo(
	file: File,
	onProgress?: (frac: number) => void
): Promise<ProcessedVideo> {
	const { video, meta } = await loadVideoMeta(file);

	const needsResize = meta.width > MAX_W || meta.height > MAX_H;
	if (!needsResize) {
		URL.revokeObjectURL(video.src);
		const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
		return {
			blob: file,
			mimeType: file.type || 'video/mp4',
			ext,
			width: meta.width,
			height: meta.height,
			duration: meta.duration,
			transcoded: false
		};
	}

	if (typeof MediaRecorder === 'undefined') {
		URL.revokeObjectURL(video.src);
		throw new Error('This browser cannot compress videos. Try Chrome or Firefox.');
	}

	const scale = Math.min(MAX_W / meta.width, MAX_H / meta.height);
	const dstW = Math.round((meta.width * scale) / 2) * 2;
	const dstH = Math.round((meta.height * scale) / 2) * 2;

	const canvas = document.createElement('canvas');
	canvas.width = dstW;
	canvas.height = dstH;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('No 2D canvas context.');

	const videoStream = canvas.captureStream(FPS);

	const audioCtx = new AudioContext();
	const source = audioCtx.createMediaElementSource(video);
	const dest = audioCtx.createMediaStreamDestination();
	source.connect(dest);

	const combined = new MediaStream();
	for (const t of videoStream.getVideoTracks()) combined.addTrack(t);
	for (const t of dest.stream.getAudioTracks()) combined.addTrack(t);

	const mimeType = pickMimeType();
	const recorder = new MediaRecorder(combined, {
		mimeType,
		videoBitsPerSecond: VIDEO_BITRATE
	});
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	return new Promise<ProcessedVideo>((resolve, reject) => {
		let rafId: number | null = null;

		const cleanup = () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			URL.revokeObjectURL(video.src);
			void audioCtx.close().catch(() => {});
		};

		recorder.onstop = () => {
			cleanup();
			resolve({
				blob: new Blob(chunks, { type: 'video/webm' }),
				mimeType: 'video/webm',
				ext: 'webm',
				width: dstW,
				height: dstH,
				duration: meta.duration,
				transcoded: true
			});
		};
		recorder.onerror = (e) => {
			cleanup();
			reject(e instanceof Error ? e : new Error('Video recorder failed.'));
		};

		video.onended = () => {
			if (recorder.state !== 'inactive') recorder.stop();
		};

		recorder.start(1000);
		void video.play().catch((err) => {
			cleanup();
			reject(err instanceof Error ? err : new Error('Could not play source video.'));
		});

		const draw = () => {
			if (video.ended) return;
			ctx.drawImage(video, 0, 0, dstW, dstH);
			onProgress?.(Math.min(1, video.currentTime / meta.duration));
			rafId = requestAnimationFrame(draw);
		};
		draw();
	});
}
