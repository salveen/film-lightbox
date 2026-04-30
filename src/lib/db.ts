import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface PhotoRecord {
	id: string;
	blob: Blob;
	width: number;
	height: number;
	orientation: Orientation;
	addedAt: number;
	duration?: number;
}

export interface AudioRecord {
	id: 'current';
	// blob is present for uploaded audio; for YouTube source it may be undefined
	blob?: Blob;
	source: 'upload' | 'youtube';
	youtubeUrl?: string;
	mimeType?: string;
	durationSec?: number;
}

export interface ProjectSettings {
	defaultDuration: number;
	transitionMs: number;
	pairPortraits: boolean;
}

export interface ProjectRecord {
	id: 'current';
	photoOrder: string[];
	settings: ProjectSettings;
}

interface FilmLightboxDB extends DBSchema {
	photos: { key: string; value: PhotoRecord };
	audio: { key: 'current'; value: AudioRecord };
	project: { key: 'current'; value: ProjectRecord };
}

export const DEFAULT_SETTINGS: ProjectSettings = {
	defaultDuration: 4,
	transitionMs: 800,
	pairPortraits: true
};

let dbPromise: Promise<IDBPDatabase<FilmLightboxDB>> | null = null;

export function getDB() {
	if (!dbPromise) {
		dbPromise = openDB<FilmLightboxDB>('film-lightbox', 1, {
			upgrade(db) {
				db.createObjectStore('photos', { keyPath: 'id' });
				db.createObjectStore('audio', { keyPath: 'id' });
				db.createObjectStore('project', { keyPath: 'id' });
			}
		});
	}
	return dbPromise;
}

function uid(): string {
	return crypto.randomUUID();
}

function detectOrientation(w: number, h: number): Orientation {
	if (w === h) return 'square';
	return w > h ? 'landscape' : 'portrait';
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Could not decode image'));
			img.src = url;
		});
		return { width: img.naturalWidth, height: img.naturalHeight };
	} finally {
		URL.revokeObjectURL(url);
	}
}

export async function addPhoto(blob: Blob): Promise<PhotoRecord> {
	const { width, height } = await readImageDimensions(blob);
	const record: PhotoRecord = {
		id: uid(),
		blob,
		width,
		height,
		orientation: detectOrientation(width, height),
		addedAt: Date.now()
	};
	const db = await getDB();
	const tx = db.transaction(['photos', 'project'], 'readwrite');
	await tx.objectStore('photos').put(record);
	const project = (await tx.objectStore('project').get('current')) ?? {
		id: 'current' as const,
		photoOrder: [],
		settings: DEFAULT_SETTINGS
	};
	project.photoOrder = [...project.photoOrder, record.id];
	await tx.objectStore('project').put(project);
	await tx.done;
	return record;
}

export async function deletePhoto(id: string) {
	const db = await getDB();
	const tx = db.transaction(['photos', 'project'], 'readwrite');
	await tx.objectStore('photos').delete(id);
	const project = await tx.objectStore('project').get('current');
	if (project) {
		project.photoOrder = project.photoOrder.filter((x) => x !== id);
		await tx.objectStore('project').put(project);
	}
	await tx.done;
}

export async function loadProject(): Promise<{ photos: PhotoRecord[]; audio?: AudioRecord; settings: ProjectSettings }> {
	const db = await getDB();
	const project = (await db.get('project', 'current')) ?? {
		id: 'current' as const,
		photoOrder: [],
		settings: DEFAULT_SETTINGS
	};
	const audio = await db.get('audio', 'current');
	const all = await db.getAll('photos');
	const byId = new Map(all.map((p) => [p.id, p]));
	const ordered = project.photoOrder.map((id) => byId.get(id)).filter((p): p is PhotoRecord => !!p);
	const orphaned = all.filter((p) => !project.photoOrder.includes(p.id));
	const photos = [...ordered, ...orphaned];
	return { photos, audio, settings: project.settings };
}

export async function saveOrder(order: string[]) {
	const db = await getDB();
	const project = (await db.get('project', 'current')) ?? {
		id: 'current' as const,
		photoOrder: [],
		settings: DEFAULT_SETTINGS
	};
	project.photoOrder = order;
	await db.put('project', project);
}

export async function saveSettings(settings: ProjectSettings) {
	const db = await getDB();
	const project = (await db.get('project', 'current')) ?? {
		id: 'current' as const,
		photoOrder: [],
		settings
	};
	project.settings = settings;
	await db.put('project', project);
}

export async function setPhotoDuration(id: string, duration: number | undefined) {
	const db = await getDB();
	const photo = await db.get('photos', id);
	if (!photo) return;
	photo.duration = duration;
	await db.put('photos', photo);
}

export async function saveAudio(blob: Blob, source: 'upload' | 'youtube', youtubeUrl?: string) {
	const db = await getDB();
	const record: AudioRecord = {
		id: 'current',
		blob,
		source,
		youtubeUrl,
		mimeType: blob.type || 'audio/mpeg'
	};
	await db.put('audio', record);
	return record;
}

export async function saveYouTubeLink(url: string) {
	const db = await getDB();
	const record: AudioRecord = {
		id: 'current',
		source: 'youtube',
		youtubeUrl: url
	};
	await db.put('audio', record);
	return record;
}

export async function clearAudio() {
	const db = await getDB();
	await db.delete('audio', 'current');
}
