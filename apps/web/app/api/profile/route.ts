import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { display_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body.display_name !== "string" ||
    body.display_name.length > 100
  ) {
    return NextResponse.json(
      { error: "display_name must be a string (max 100 chars)" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: body.display_name.trim() || null })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
