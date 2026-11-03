#!/usr/bin/env node
// Blocks a commit/push if staged (or, with --all, tracked) files contain secrets.
// --objects <git rev-list args> scans every file version in those commits instead: the pre-push hook passes the
// commits being pushed, CI passes --all (whole history), so a secret added and deleted later is still caught.
// Usage: node scripts/secrets-scan.mjs [--all | --objects <rev-list args...>]
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const objectsAt = process.argv.indexOf("--objects");
const all = objectsAt === -1 && process.argv.includes("--all");

/** Files to scan: { name, read() }. */
function targets() {
  if (objectsAt !== -1) {
    const lines = execFileSync("git", ["rev-list", "--objects", ...process.argv.slice(objectsAt + 1)], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }).split("\n");
    const seen = new Set();
    const out = [];
    for (const line of lines) {
      const [sha, ...rest] = line.trim().split(" ");
      const name = rest.join(" ");
      if (!sha || !name || seen.has(sha)) continue; // commits and the root tree have no path
      seen.add(sha);
      out.push({ name, sha });
    }
    // Only blobs (paths of trees are listed too).
    const types = execFileSync("git", ["cat-file", "--batch-check=%(objecttype)"], {
      input: out.map((o) => o.sha).join("\n") + "\n",
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).split("\n");
    return out
      .filter((_, i) => types[i] === "blob")
      .map((o) => ({ name: o.name, read: () => execFileSync("git", ["cat-file", "blob", o.sha], { maxBuffer: 64 * 1024 * 1024 }) }));
  }
  return execSync(all ? "git ls-files" : "git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      // Staged mode scans the index blob (what will actually be committed), not the working tree.
      read: () => (all ? readFileSync(name) : execFileSync("git", ["show", `:${name}`], { maxBuffer: 64 * 1024 * 1024 })),
    }));
}
const list = targets();

const FORBIDDEN_FILES = [/^\.env(?!\.example$)/, /(^|\/)\.env\.(?!example$)/, /^\.vercel\//, /CREDENTIALS\.local\.md$/i, /\.pem$/, /(^|\/)\.auth\//];

const PATTERNS = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Postgres URL with password", re: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}/ },
  { name: "Supabase access token", re: /sbp_[a-f0-9]{40}/ },
  { name: "Vercel token", re: /vercel_[A-Za-z0-9]{20,}|"token"\s*:\s*"[A-Za-z0-9]{24}"/ },
  { name: "Private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Assigned secret", re: /(SERVICE_ROLE_KEY|SECRET_KEY|DB_PASSWORD|_PASSWORD)[ \t]*=[ \t]*['"]?[^\s'"#]{8,}/ },
];

// Values from local env files must never appear verbatim in tracked content.
const localValues = [];
for (const envFile of [".env.local", ".env.development.local", ".env.production.local"]) {
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (key.startsWith("NEXT_PUBLIC_") || value.length < 12) continue;
    localValues.push({ key, value });
  }
}

const findings = [];
for (const { name: file, read } of list) {
  if (FORBIDDEN_FILES.some((re) => re.test(file))) {
    findings.push(`${file}: forbidden file must not be committed`);
    continue;
  }
  let text;
  try {
    const buf = read();
    if (buf.includes(0)) continue; // binary
    text = buf.toString("utf8");
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) findings.push(`${file}: looks like ${name}`);
  }
  for (const { key, value } of localValues) {
    if (text.includes(value)) findings.push(`${file}: contains the value of ${key} from .env.local`);
  }
}

if (findings.length) {
  console.error(`secrets-scan: ${findings.length} problem(s) — aborting.`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`secrets-scan: ${list.length} file(s) clean.`);
