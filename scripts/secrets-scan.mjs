#!/usr/bin/env node
// Blocks a commit/push if staged (or, with --all, tracked) files contain secrets.
// Usage: node scripts/secrets-scan.mjs [--all]
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const all = process.argv.includes("--all");
const list = execSync(
  all ? "git ls-files" : "git diff --cached --name-only --diff-filter=ACMR",
  { encoding: "utf8" },
)
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

const FORBIDDEN_FILES = [/^\.env(?!\.example$)/, /(^|\/)\.env\.(?!example$)/, /^\.vercel\//, /CREDENTIALS\.local\.md$/i, /\.pem$/, /(^|\/)\.auth\//];

const PATTERNS = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Postgres URL with password", re: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
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
for (const file of list) {
  if (FORBIDDEN_FILES.some((re) => re.test(file))) {
    findings.push(`${file}: forbidden file must not be committed`);
    continue;
  }
  let text;
  try {
    // Staged mode scans the index blob (what will actually be committed), not the working tree.
    const buf = all ? readFileSync(file) : execFileSync("git", ["show", `:${file}`], { maxBuffer: 64 * 1024 * 1024 });
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
