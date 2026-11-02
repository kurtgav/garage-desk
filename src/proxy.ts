import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

const STAFF_PREFIXES = ["/jobs", "/customers", "/dashboard", "/settings"];
const isDev = process.env.NODE_ENV !== "production";

/** Per-request nonce CSP (Next applies the nonce to its own scripts during SSR). */
function contentSecurityPolicy(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React style attributes cannot carry a nonce; inline styles are a low-risk vector.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
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
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const { pathname } = request.nextUrl;
  const isStaffPath = pathname === "/" || STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
