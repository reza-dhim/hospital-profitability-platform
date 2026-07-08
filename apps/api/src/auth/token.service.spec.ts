import { generateKeyPairSync } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { TokenService } from "./token.service";
import type { JwtPayload } from "./types/jwt-payload.type";

function makeKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function configWithKeys(privateKey: string, publicKey: string): ConfigService {
  return {
    get: (key: string) => {
      if (key === "JWT_ACCESS_PRIVATE_KEY") return privateKey;
      if (key === "JWT_ACCESS_PUBLIC_KEY") return publicKey;
      return undefined;
    },
  } as unknown as ConfigService;
}

describe("TokenService", () => {
  const { privateKey, publicKey } = makeKeyPair();
  const service = new TokenService(new JwtService(), configWithKeys(privateKey, publicKey));

  const payload: JwtPayload = {
    sub: "user-1",
    org_id: "org-1",
    active_hospital_id: "hospital-1",
    role: "system_admin",
    permissions_hash: "abc123",
  };

  it("signs and verifies an access token round-trip", () => {
    const token = service.signAccessToken(payload);
    const decoded = service.verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.org_id).toBe(payload.org_id);
  });

  it("rejects a token signed with a different key (RS256, not a shared secret)", () => {
    const other = makeKeyPair();
    const badService = new TokenService(new JwtService(), configWithKeys(other.privateKey, other.publicKey));
    const badToken = badService.signAccessToken(payload);
    expect(() => service.verifyAccessToken(badToken)).toThrow();
  });

  it("generates a refresh token whose hash matches hashRefreshToken", () => {
    const { token, tokenHash } = service.generateRefreshToken();
    expect(service.hashRefreshToken(token)).toBe(tokenHash);
  });

  it("generates unique refresh tokens on each call", () => {
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a.token).not.toBe(b.token);
  });

  it("sets a 7-day refresh token expiry, per docs/05_AUTHENTICATION.md §1", () => {
    const before = Date.now();
    const { expiresAt } = service.generateRefreshToken();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(before + sevenDaysMs + 5000);
  });
});
