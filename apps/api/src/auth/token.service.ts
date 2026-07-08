import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import type { JwtPayload } from "./types/jwt-payload.type";

/** docs/05_AUTHENTICATION.md §1: access token 15 minutes, refresh token 7 days. */
export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues/verifies RS256 access tokens and opaque refresh tokens.
 * The refresh token is deliberately NOT a JWT — an opaque random value,
 * hashed (SHA-256) before it ever touches the database, per §1 "stored
 * hashed". SHA-256 (not Argon2) is appropriate here: this is a 384-bit
 * random value, not a low-entropy human password, so a fast, deterministic
 * hash is the right tool — Argon2's deliberate slowness exists to resist
 * brute-forcing short human-chosen secrets, which doesn't apply here.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  private loadPem(envKey: string): string {
    const raw = this.config.get<string>(envKey) ?? "";
    return raw.replace(/\\n/g, "\n");
  }

  signAccessToken(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      algorithm: "RS256",
      privateKey: this.loadPem("JWT_ACCESS_PRIVATE_KEY"),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      algorithms: ["RS256"],
      publicKey: this.loadPem("JWT_ACCESS_PUBLIC_KEY"),
    });
  }

  generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(48).toString("hex");
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
