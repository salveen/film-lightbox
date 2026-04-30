import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function parseEnv(text) {
  const lines = text.split(/\r?\n/);
  const out = {};
  for (const l of lines) {
    const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const envText = fs.readFileSync('.env', 'utf8');
  const env = parseEnv(envText);
  const url = env.PUBLIC_SUPABASE_URL;
  // prefer service role key when available for full visibility
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.PUBLIC_SUPABASE_ANON_KEY;
  const bucket = env.PUBLIC_SUPABASE_BUCKET || 'rooms';
  if (!url || !key) {
    console.error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log('Listing top-level files in bucket', bucket);
  const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) {
    console.error('List error:', error);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log('No files or folders at root.');
    return;
  }
  const groups = new Map();
  for (const f of data) {
    const parts = f.name.split('/');
    const top = parts[0];
    groups.set(top, (groups.get(top) || 0) + 1);
  }
  console.log('Top-level groups and counts:');
  for (const [k, v] of groups) console.log(k, v);
  // Also list first group's files for inspection
  const first = Array.from(groups.keys())[0];
  if (first) {
    console.log('\nListing files under', first);
    const { data: files, error: err2 } = await supabase.storage.from(bucket).list(first, { limit: 1000 });
    if (err2) console.error('List error 2:', err2);
    else console.log(files.map(f => f.name));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
