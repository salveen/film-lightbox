import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as pub } from '$env/dynamic/public';
import { env as priv } from '$env/dynamic/private';

const PUBLIC_SUPABASE_URL = pub.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = priv.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_BUCKET = pub.PUBLIC_SUPABASE_BUCKET || 'rooms';

let admin: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
	if (!admin) {
		if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error(
				'Server Supabase env vars missing. Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
			);
		}
		admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false }
		});
	}
	return admin;
}
