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
    global: { fetch: (...args) => fetch(args[0], { ...args[1], signal: args[1]?.signal ?? AbortSignal.timeout(8_000) }) },
  });
  return _client;
}

/**
 * Race a Supabase query against a timeout. Returns null on timeout.
 * Prevents the clarify pipeline from hanging when Supabase is unreachable.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms = 5_000): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
