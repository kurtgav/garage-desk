import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STAFF_PREFIXES = ["/jobs", "/customers", "/dashboard", "/settings"];

/**
 * Refreshes the Supabase session cookie for staff pages and does an optimistic
 * redirect to /login. Real authorisation is in the pages (requireStaff/requireOwner)
 * and in Postgres RLS. Requests without an auth cookie (e.g. the customer link)
 * skip the auth round-trip entirely.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaffPath = pathname === "/" || STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

  if (!hasAuthCookie) {
    if (isStaffPath) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
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
