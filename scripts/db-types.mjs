#!/usr/bin/env node
// Regenerates src/lib/database.types.ts from the LOCAL stack. Writes the file only on success
// (a failed `> file` redirect used to blank it). `--local` can pick up another project's
// containers on this machine, so the local DB URL from .env.development.local is used instead.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL && existsSync(".env.development.local")) process.loadEnvFile(".env.development.local");
const url = process.env.SUPABASE_DB_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  console.error("db:types: SUPABASE_DB_URL must point at the local stack (see .env.development.local)");
  process.exit(1);
}
const types = execFileSync("npx", ["supabase", "gen", "types", "typescript", "--db-url", url, "--schema", "public"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
  shell: process.platform === "win32", // npx is a .cmd shim on Windows; args are fixed, no user input
});
if (!types.includes("export type Database")) {
  console.error("db:types: unexpected output, file left unchanged");
  process.exit(1);
}
writeFileSync("src/lib/database.types.ts", types);
console.log("db:types: src/lib/database.types.ts updated");
