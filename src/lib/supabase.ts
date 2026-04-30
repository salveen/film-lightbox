import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
	PUBLIC_SUPABASE_BUCKET
} from '$env/static/public';

export const SUPABASE_BUCKET = PUBLIC_SUPABASE_BUCKET || 'rooms';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
	if (!client) {
		if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
			throw new Error(
				'Supabase env vars missing. Copy .env.example to .env and fill in PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY.'
			);
		}
		client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			auth: { persistSession: false }
		});
	}
	return client;
}

export function roomFolder(code: string): string {
	return `room_${code}`;
}
