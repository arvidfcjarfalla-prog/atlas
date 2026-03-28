import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Rate limiting — sliding window, in-memory (per-isolate on Vercel)
// ---------------------------------------------------------------------------
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20;
let callsSinceCleanup = 0;

function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  const now = Date.now();

  // Periodic cleanup to prevent memory leak
  if (++callsSinceCleanup >= 100) {
    callsSinceCleanup = 0;
    for (const [key, entry] of rateLimit) {
      if (now > entry.resetAt) rateLimit.delete(key);
    }
  }

  const entry = rateLimit.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Protected routes — redirect to /auth/login if no session
// ---------------------------------------------------------------------------
const PROTECTED = ["/app/gallery", "/app/profile"];

export async function middleware(request: NextRequest) {
  // --- Rate-limit AI endpoints before anything else ---
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/ai/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.ip ??
      "unknown";
    const result = checkRateLimit(ip);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfter) },
        },
      );
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  // Skip auth entirely if Supabase env vars aren't configured yet
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  // @supabase/ssr requires us to refresh the session on every request
  // and forward the updated cookies in the response.
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh session (also validates it against Supabase)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect logged-in users away from auth pages
  if (
    user &&
    (pathname === "/auth/login" ||
      pathname === "/auth/signup" ||
      pathname === "/login" ||
      pathname === "/signup")
  ) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/app";
    return NextResponse.redirect(appUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
