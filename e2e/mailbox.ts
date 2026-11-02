// Local mail catcher for the password-reset e2e (PLAN Phase 5). Supabase's local stack runs Mailpit
// (supabase/config.toml [local_smtp], port 56424, also in CI after `supabase start`); Auth "sends" every
// email there. Local / CI only: production email goes through the real mailer.
//
//   await clearMailbox(email);                       // before requesting a reset
//   ...submit /forgot-password...
//   await page.goto(await latestRecoveryLink(email)); // relative /auth/confirm?token_hash=…&type=recovery
//
// Mailpit API: GET /api/v1/search?query=to:"addr" (newest first), GET /api/v1/message/{ID} (HTML/Text),
// DELETE /api/v1/search?query=… . UI: http://127.0.0.1:56424
import { createHash } from "node:crypto";
import { admin } from "./support";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:56424";

const search = (email: string) => `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`;

/** Deletes every caught email addressed to `email`. */
export async function clearMailbox(email: string): Promise<void> {
  const res = await fetch(search(email), { method: "DELETE" });
  if (!res.ok) throw new Error(`Mailpit delete failed: ${res.status} (is the local stack running with [local_smtp]?)`);
}

/**
 * Waits for the newest recovery email to `email` and returns its link as a path
 * ("/auth/confirm?token_hash=…&type=recovery"), so page.goto() uses the test's baseURL, not the site_url.
 */
export async function latestRecoveryLink(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (await fetch(search(email))).json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML: string };
      const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1];
      if (!href) throw new Error("The newest email has no /auth/confirm link (check supabase/templates/recovery.html)");
      const url = new URL(href.replaceAll("&amp;", "&"));
      return `${url.pathname}${url.search}`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${email} within ${timeoutMs} ms`);
}

/**
 * The forgot-password form allows 5 requests per 15 minutes per client IP (src/lib/rate-limit.ts). Repeated
 * local runs share one IP, so specs clear that bucket first. Keys are sha256("passwordReset:<ip>"); the IP
 * the app sees locally depends on how the request arrives, hence the candidates.
 */
export async function clearPasswordResetLimit(): Promise<void> {
  const keys = ["::1", "127.0.0.1", "::ffff:127.0.0.1", "unknown"].map((ip) =>
    createHash("sha256").update(`passwordReset:${ip}`).digest("hex"),
  );
  const { error } = await admin().from("rate_limits").delete().in("key", keys);
  if (error) throw new Error(`clear rate limit failed: ${error.message}`);
}
