import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Supabase OAuth callback handler.
// After Google (or any OAuth) login, Supabase redirects here with a `code`.
// We exchange it for a session and then redirect to the intended destination.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // Something went wrong — send to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
