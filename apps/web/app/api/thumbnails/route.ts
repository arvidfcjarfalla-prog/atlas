import { NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// POST /api/thumbnails — receive base64 JPEG from client, upload via service role
export async function POST(request: Request) {
  // Verify the caller is authenticated
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dataUrl: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { dataUrl } = body;
  if (!dataUrl?.startsWith("data:image/jpeg;base64,")) {
    return NextResponse.json({ error: "Invalid dataUrl" }, { status: 400 });
  }

  // Decode base64 to buffer
  const base64 = dataUrl.replace("data:image/jpeg;base64,", "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 100) {
    return NextResponse.json({ error: "Image too small" }, { status: 400 });
  }

  // Upload with service role (bypasses RLS)
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error: uploadError } = await serviceClient.storage
    .from("thumbnails")
    .upload(filename, buffer, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = serviceClient.storage.from("thumbnails").getPublicUrl(filename);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
