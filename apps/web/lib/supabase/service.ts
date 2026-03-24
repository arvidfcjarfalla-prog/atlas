import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Service-role Supabase client — bypasses RLS for internal server operations.
// Never expose to the browser.

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getServiceClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}
