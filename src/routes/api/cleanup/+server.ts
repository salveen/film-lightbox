import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getServerSupabase, SUPABASE_BUCKET } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const TTL_HOURS = Number(env.ROOM_TTL_HOURS || '24');

async function runCleanup() {
	const supa = getServerSupabase();
	const cutoff = Date.now() - TTL_HOURS * 60 * 60 * 1000;

	const { data: folders, error: listErr } = await supa.storage.from(SUPABASE_BUCKET).list('', {
		limit: 1000
	});
	if (listErr) return json({ error: listErr.message }, { status: 500 });

	let deleted = 0;
	for (const folder of folders ?? []) {
		if (!folder.name.startsWith('room_')) continue;
		const { data: files } = await supa.storage
			.from(SUPABASE_BUCKET)
			.list(folder.name, { limit: 1000 });
		if (!files) continue;
		const stale = files
			.filter((f) => {
				const t = f.created_at ? Date.parse(f.created_at) : Date.now();
				return t < cutoff;
			})
			.map((f) => `${folder.name}/${f.name}`);
		if (stale.length > 0) {
			const { error: delErr } = await supa.storage.from(SUPABASE_BUCKET).remove(stale);
			if (!delErr) deleted += stale.length;
		}
	}

	return json({ deleted, ttlHours: TTL_HOURS });
}

export const POST: RequestHandler = async () => runCleanup();

export const GET: RequestHandler = async ({ request }) => {
	const secret = env.CRON_SECRET;
	if (secret) {
		const auth = request.headers.get('authorization');
		if (auth !== `Bearer ${secret}`) {
			return json({ error: 'unauthorized' }, { status: 401 });
		}
	}
	return runCleanup();
};
