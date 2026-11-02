#!/usr/bin/env node
// Fails if the client bundle (.next/static) contains server secrets. Run after `pnpm build`.
// Prints only file names and the rule that matched, never the secret.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Everything a browser can receive: client JS/CSS, plus prerendered HTML/RSC payloads.
const ROOTS = [
  { dir: join(".next", "static"), include: () => true },
  { dir: join(".next", "server", "app"), include: (f) => /\.(html|rsc|body|txt)$/.test(f) },
];
const ROOT = ROOTS[0].dir;
if (!existsSync(ROOT)) {
  console.error(`bundle-scan: ${ROOT} not found — run \`pnpm build\` first.`);
  process.exit(1);
}

// Values under this length are skipped: the local DB password "postgres" would match "postgrest" in supabase-js.
const MIN_VALUE_LENGTH = 12;
const SECRET_KEY = (k) => k === "SUPABASE_SERVICE_ROLE_KEY" || k === "SUPABASE_DB_URL" || /^SEED_.*_PASSWORD$/.test(k);

// Exact secret values from process.env and the local env files.
const sources = [["process.env", Object.entries(process.env)]];
for (const file of [".env.local", ".env.development.local", ".env.production.local"]) {
  if (!existsSync(file)) continue;
  const entries = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) entries.push([m[1], m[2].replace(/^(['"])(.*)\1$/, "$2")]);
  }
  sources.push([file, entries]);
}

const values = [];
const skipped = new Set();
for (const [from, entries] of sources) {
  for (const [key, value] of entries) {
    if (!SECRET_KEY(key) || !value) continue;
    let candidates = [value];
    if (key === "SUPABASE_DB_URL") {
      try {
        const pw = new URL(value).password;
        candidates = pw ? [...new Set([pw, decodeURIComponent(pw)])] : [];
      } catch {
        candidates = [];
      }
    }
    for (const v of candidates) {
      if (v.length < MIN_VALUE_LENGTH) skipped.add(key);
      else values.push({ label: `value of ${key}${key === "SUPABASE_DB_URL" ? " password" : ""} (from ${from})`, v });
    }
  }
}

const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;
const isServiceRoleJwt = (payload) =>
  /"role"\s*:\s*"service_role"/.test(Buffer.from(payload, "base64url").toString("utf8"));

const files = ROOTS.filter(({ dir }) => existsSync(dir)).flatMap(({ dir, include }) =>
  readdirSync(dir, { recursive: true })
    .map((f) => join(dir, String(f)))
    .filter((f) => include(f) && statSync(f).isFile()),
);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const hits = new Set();
  // A key, not the bare prefix: supabase-js ships `startsWith("sb_secret_")` in the browser client.
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) hits.add("Supabase secret key `sb_secret_…`");
  if (text.includes("service_role")) hits.add("literal `service_role`");
  for (const [, payload] of text.matchAll(JWT)) {
    if (isServiceRoleJwt(payload)) hits.add("JWT with role service_role");
  }
  for (const { label, v } of values) if (text.includes(v)) hits.add(label);
  for (const h of hits) findings.push(`${file}: ${h}`);
}

if (findings.length) {
  console.error(`bundle-scan: ${findings.length} problem(s) in the client bundle — failing.`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
const note = skipped.size ? ` (skipped short values of ${[...skipped].join(", ")})` : "";
console.log(
  `bundle-scan: ${files.length} file(s) in ${ROOTS.map((r) => r.dir).join(" + ")} clean; checked ${values.length} env value(s)${note}.`,
);
