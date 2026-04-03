import { NextResponse } from "next/server";
import { getServiceClient } from "../../../../lib/supabase/service";

export async function GET(request: Request) {
  // Verify cron secret to prevent public access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getServiceClient();
  if (!client) {
    return NextResponse.json({ error: "No database configured" }, { status: 500 });
  }

  const now = new Date().toISOString();

  // Delete data_cache entries older than 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: deletedDataCache, error: dataCacheError } = await client
    .from("data_cache")
    .delete()
    .eq("pinned", false)
    .lt("created_at", cutoff)
    .select("cache_key");

  if (dataCacheError) {
    return NextResponse.json({ error: dataCacheError.message }, { status: 500 });
  }

  // Delete clarify_cache entries that have an expires_at set and have passed it.
  // Rows with expires_at = null are permanent and are left untouched.
  const { data: deletedClarifyCache, error: clarifyCacheError } = await client
    .from("clarify_cache")
    .delete()
    .not("expires_at", "is", null)
    .lt("expires_at", now)
    .select("prompt_key");

  if (clarifyCacheError) {
    return NextResponse.json({ error: clarifyCacheError.message }, { status: 500 });
  }

  return NextResponse.json({
    data_cache_deleted: deletedDataCache?.length ?? 0,
    clarify_cache_deleted: deletedClarifyCache?.length ?? 0,
    cutoff,
  });
}
