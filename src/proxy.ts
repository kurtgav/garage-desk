import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicJob } from "@/lib/public-job";
import { isRateLimited } from "@/lib/rate-limit";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

const STAFF_PREFIXES = ["/jobs", "/customers", "/dashboard", "/settings", "/profile", "/staff"];
// Public app routes (PLAN Phase 5): no sign-in needed and never looked up as a customer token.
const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password", "/auth/confirm", "/robots.txt"];
// generateLinkToken(): 32 random bytes, base64url → exactly 43 chars. Anything else can never be a link (D-093).
const LINK_PATH = /^\/([A-Za-z0-9_-]{43})$/;
// No route matches this, so Next serves the server-rendered /_not-found (status 404).
const UNMATCHED_PATH = "/_/not-found";
const isDev = process.env.NODE_ENV !== "production";

/** Per-request nonce CSP (Next applies the nonce to its own scripts during SSR). */
function contentSecurityPolicy(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React style attributes cannot carry a nonce; inline styles are a low-risk vector.
    "style-src 'self' 'unsafe-inline'",
    // Profile photos are short-lived signed URLs from Supabase Storage (D-078).
    `img-src 'self' data: blob: ${supabaseUrl}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseUrl}${isDev ? " ws:" : ""}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * 1. Sets a nonce-based CSP on every page response.
 * 2. Refreshes the Supabase session cookie for staff pages and redirects to /login
 *    optimistically. Real authorisation is in the pages (requireStaff/requireOwner)
 *    and in Postgres RLS. Requests without an auth cookie (e.g. the customer link)
 *    skip the auth round-trip entirely.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Rebuilt on each call so refreshed auth cookies (request.cookies.set) are forwarded too.
  const forward = (rewriteTo?: URL) => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = rewriteTo
      ? NextResponse.rewrite(rewriteTo, { request: { headers } })
      : NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const { pathname } = request.nextUrl;
  const isStaffPath = STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // FR6/D-019: an unknown, revoked or rate-limited link must get the same server-rendered 404 (body and
  // headers) as any unknown URL. notFound() in the page only yields Next's client-rendered error shell,
  // so decide before render: outside the app's routes only "/{token}" can exist, and only if the lookup
  // finds it (same rate limit + lookup as the page). Server actions check the token themselves. A path that
  // cannot be a token gets the same 404 before any DB write or lookup (bot noise like /wp-login.php).
  if (!isStaffPath && !PUBLIC_PATHS.includes(pathname) && !request.headers.has("next-action")) {
    const token = LINK_PATH.exec(pathname)?.[1];
    if (!token || (await isRateLimited("publicView")) || !(await getPublicJob(token))) {
      return forward(new URL(UNMATCHED_PATH, request.url));
    }
  }
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

  if (!hasAuthCookie) {
    return isStaffPath ? NextResponse.redirect(new URL("/login", request.url)) : forward();
  }

  let response = forward();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isStaffPath) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
