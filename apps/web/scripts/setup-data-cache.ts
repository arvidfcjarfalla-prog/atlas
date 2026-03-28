/**
 * One-time setup script: creates the data_cache table in Supabase.
 *
 * Run with: npx tsx apps/web/scripts/setup-data-cache.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const client = createClient(url, key);

async function main() {
  // Check if table already exists
  const { error: checkError } = await client
    .from("data_cache")
    .select("cache_key")
    .limit(1);

  if (!checkError) {
    console.log("✓ data_cache table already exists");
    return;
  }

  console.log("Table missing, creating via individual operations...");

  // We can't run raw SQL via the REST API, so we create a temporary
  // RPC function to bootstrap the table. This requires the SQL to be
  // run in the Supabase Dashboard SQL Editor.
  console.log("");
  console.log("Run this SQL in the Supabase Dashboard → SQL Editor:");
  console.log("─".repeat(60));
  console.log(`
create table if not exists public.data_cache (
  id uuid default gen_random_uuid() primary key,
  cache_key text not null unique,
  data jsonb not null,
  profile jsonb not null,
  source text not null,
  description text not null default '',
  resolution_status text,
  created_at timestamptz default now(),
  expires_at timestamptz
);

create index if not exists data_cache_key_idx on public.data_cache (cache_key);

create index if not exists data_cache_expires_idx
  on public.data_cache (expires_at)
  where expires_at is not null;

alter table public.data_cache enable row level security;
  `.trim());
  console.log("─".repeat(60));
  console.log("");
  console.log("Then re-run this script to verify.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
