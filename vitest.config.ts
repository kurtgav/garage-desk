import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// Same precedence as vite's loadEnv: real env vars (CI) win over the file.
// `vite` is not a direct dependency (pnpm keeps it nested), so node:util parses the file.
function loadDevEnv(): Record<string, string> {
  const file = `${root}.env.development.local`;
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...fromFile, ...process.env })) if (v !== undefined) merged[k] = v;
  return merged;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": `${root}src`,
      // `server-only` throws outside a React Server Component bundle; tests import server modules directly.
      "server-only": `${root}tests/stubs/server-only.ts`,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: loadDevEnv(),
          // One shared local database: run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
