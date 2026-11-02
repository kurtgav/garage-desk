import { describe, expect, it } from "vitest";
import { generateLinkToken, hashLinkToken } from "@/lib/tokens";

describe("FR6 link tokens", () => {
  it("generateLinkToken is 32 CSPRNG bytes as 43-char base64url", () => {
    const token = generateLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("generateLinkToken is unique across 1000 calls", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateLinkToken));
    expect(tokens.size).toBe(1000);
  });

  it("hashLinkToken is lowercase hex SHA-256 (known vectors)", () => {
    expect(hashLinkToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashLinkToken("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashLinkToken of a real token is 64 lowercase hex chars and differs from the token", () => {
    const token = generateLinkToken();
    const hash = hashLinkToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });
});
