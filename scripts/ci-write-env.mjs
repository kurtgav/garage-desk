#!/usr/bin/env node
// Writes the app env file from the running local Supabase stack (CI + local dev).
// Usage: node scripts/ci-write-env.mjs [--out <path>]   (default .env.development.local)
// Never prints values: they are local demo keys, but keep the habit.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const outIdx = process.argv.indexOf("--out");
const out = outIdx > -1 ? process.argv[outIdx + 1] : ".env.development.local";
if (!out) {
  console.error("ci-write-env: --out needs a path");
  process.exit(1);
}

// CI has `supabase` on PATH (setup-cli); locally it is the npm devDependency.
let raw;
const errors = [];
for (const cmd of ["supabase status -o env", "npx --no-install supabase status -o env"]) {
  try {
    raw = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    break;
  } catch (e) {
    errors.push(`${cmd}: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
  }
}
if (raw === undefined) {
  console.error("ci-write-env: could not read `supabase status` (is `supabase start` running?)");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const status = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) status[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SECRET_KEY || status.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: status.DB_URL,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

const missing = Object.keys(env).filter((k) => !env[k]);
if (missing.length) {
  console.error(`ci-write-env: supabase status gave no value for: ${missing.join(", ")}`);
  process.exit(1);
}

// Unquoted KEY=value so the file can also be sourced by bash (`set -a; . file`).
writeFileSync(out, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
console.log(`ci-write-env: wrote ${Object.keys(env).join(", ")} to ${out}`);
