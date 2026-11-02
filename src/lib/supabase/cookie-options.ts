// No browser Supabase client exists, so JavaScript never needs the session cookie:
// httpOnly keeps tokens away from any injected script.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
