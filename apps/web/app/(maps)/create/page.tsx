"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

export default function CreateMapPage() {
  return (
    <Suspense>
      <CreateRedirect />
    </Suspense>
  );
}

// /create is legacy — redirect logged-in users to gallery, everyone else to landing.
function CreateRedirect() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      router.replace("/");
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      router.replace(data.user ? "/app/gallery" : "/");
    });
  }, [router]);

  // Blank screen while redirecting — no flash
  return null;
}
