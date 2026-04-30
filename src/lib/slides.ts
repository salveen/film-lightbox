import type { PhotoRecord } from './db';

export type Slide =
	| { kind: 'single'; photo: PhotoRecord; duration: number }
	| { kind: 'pair'; left: PhotoRecord; right: PhotoRecord; duration: number };

export function buildSlides(
	photos: PhotoRecord[],
	defaultDuration: number,
	pairPortraits: boolean
): Slide[] {
	const out: Slide[] = [];
	let i = 0;
	while (i < photos.length) {
		const a = photos[i];
		const b = photos[i + 1];
		if (
			pairPortraits &&
			b &&
			a.orientation === 'portrait' &&
			b.orientation === 'portrait'
		) {
			const dur = Math.max(a.duration ?? defaultDuration, b.duration ?? defaultDuration);
			out.push({ kind: 'pair', left: a, right: b, duration: dur });
			i += 2;
		} else {
			out.push({ kind: 'single', photo: a, duration: a.duration ?? defaultDuration });
			i += 1;
		}
	}
	return out;
}
