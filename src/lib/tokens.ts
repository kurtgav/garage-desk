import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 32 bytes from the OS CSPRNG, base64url → 43 chars (PRD FR6). Shown once, never stored. */
export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this SHA-256 (lowercase hex) is stored in job_links.token_hash. */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
