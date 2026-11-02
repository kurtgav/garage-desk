// Generates strong seed-staff passwords ONCE and stores them in:
//   - .env.local (gitignored) for the seed script and e2e tests
//   - CREDENTIALS.local.md (gitignored) for posting in the client channel
//   - Vercel production env (with --push-vercel)
// Never prints a password. Re-running keeps existing passwords unless --rotate.
//
// Usage: pnpm credentials:generate [--push-vercel] [--rotate] [--url https://…]
import { randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { SEED_STAFF } from "./staff";

/** Plaintext secrets: owner-only file mode (mode applies on create; chmod covers existing files). */
function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

const ENV_FILE = ".env.local";
const CREDS_FILE = "CREDENTIALS.local.md";
const args = process.argv.slice(2);
const rotate = args.includes("--rotate");
const pushVercel = args.includes("--push-vercel");
const urlArg = args[args.indexOf("--url") + 1];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function strongPassword(length = 20): string {
  for (;;) {
    const pw = Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    // Supabase password policy: lower + upper + digits (supabase/config.toml).
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}

function readEnv(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(ENV_FILE)) return map;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) map.set(m[1], m[2].replace(/^['"]|['"]$/g, ""));
  }
  return map;
}

function upsertEnv(values: Record<string, string>): void {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (key && key in values) {
      seen.add(key);
      return `${key}=${values[key]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(values)) if (!seen.has(k)) out.push(`${k}=${v}`);
  writePrivate(ENV_FILE, out.join("\n").replace(/\n*$/, "\n"));
}

function vercelEnvSet(key: string, value: string): void {
  const base = ["--scope", "kurtgavs-projects"];
  try {
    execFileSync("vercel", ["env", "rm", key, "production", "--yes", ...base], { stdio: "ignore", shell: true });
  } catch {
    // not set yet
  }
  execFileSync("vercel", ["env", "add", key, "production", ...base], { input: value, stdio: ["pipe", "ignore", "inherit"], shell: true });
}

const env = readEnv();
const passwords: Record<string, string> = {};
for (const s of SEED_STAFF) {
  const existing = env.get(s.envKey);
  passwords[s.envKey] = !rotate && existing && existing.length >= 16 ? existing : strongPassword();
}
upsertEnv(passwords);

const siteUrl = urlArg && !urlArg.startsWith("--") ? urlArg : env.get("NEXT_PUBLIC_SITE_URL") ?? "(set the live URL)";
const rows = SEED_STAFF.map((s) => `| ${s.fullName} | ${s.role} | ${s.email} | \`${passwords[s.envKey]}\` |`).join("\n");
const previous = existsSync(CREDS_FILE) ? readFileSync(CREDS_FILE, "utf8") : "";
const linkSection = /## Demo customer link[\s\S]*$/.exec(previous)?.[0] ?? "";
writePrivate(
  CREDS_FILE,
  `# Garage Desk — demo credentials (DO NOT COMMIT)\n\nGenerated ${new Date().toISOString()}. Post in the client channel, then delete this file.\n\nLive app: ${siteUrl}/login\n\n| Name | Role | Email | Password |\n|---|---|---|---|\n${rows}\n\n${linkSection}`.trimEnd() + "\n",
);

if (pushVercel) {
  for (const s of SEED_STAFF) vercelEnvSet(s.envKey, passwords[s.envKey]);
}

console.log(
  `credentials: ${SEED_STAFF.length} passwords ${rotate ? "rotated" : "ready"} → ${ENV_FILE}, ${CREDS_FILE}${pushVercel ? ", Vercel production env" : ""} (values not printed)`,
);
