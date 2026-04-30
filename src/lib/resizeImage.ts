const MAX_W = 1920;
const MAX_H = 1080;
const QUALITY = 0.85;

export interface ResizedImage {
	blob: Blob;
	width: number;
	height: number;
	mimeType: string;
}

export async function resizeForTV(file: File): Promise<ResizedImage> {
	const bitmap = await createImageBitmap(file);
	const srcW = bitmap.width;
	const srcH = bitmap.height;
	const isPortrait = srcH > srcW;
	const maxLong = isPortrait ? MAX_H : MAX_W;
	const maxShort = isPortrait ? MAX_W : MAX_H;
	const longSrc = isPortrait ? srcH : srcW;
	const shortSrc = isPortrait ? srcW : srcH;
	const scale = Math.min(1, maxLong / longSrc, maxShort / shortSrc);
	const dstW = Math.round(srcW * scale);
	const dstH = Math.round(srcH * scale);

	const canvas =
		typeof OffscreenCanvas !== 'undefined'
			? new OffscreenCanvas(dstW, dstH)
			: Object.assign(document.createElement('canvas'), { width: dstW, height: dstH });
	const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d') as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	if (!ctx) throw new Error('No 2D context available');
	ctx.drawImage(bitmap, 0, 0, dstW, dstH);
	bitmap.close();

	const mimeType = 'image/jpeg';
	let blob: Blob;
	if (canvas instanceof OffscreenCanvas) {
		blob = await canvas.convertToBlob({ type: mimeType, quality: QUALITY });
	} else {
		blob = await new Promise<Blob>((resolve, reject) => {
			(canvas as HTMLCanvasElement).toBlob(
				(b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
				mimeType,
				QUALITY
			);
		});
	}
	return { blob, width: dstW, height: dstH, mimeType };
}
