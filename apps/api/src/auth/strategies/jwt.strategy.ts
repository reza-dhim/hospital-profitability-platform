import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayload } from "../types/jwt-payload.type";

/**
 * Verifies the RS256 access token's signature/expiry (docs/05_AUTHENTICATION.md
 * §1) and returns its payload as `request.user`. This is the abstraction point
 * docs/05_AUTHENTICATION.md §5 reserves for a future SSO/SAML AuthStrategy —
 * token issuance (TokenService) stays the same regardless of how identity was
 * verified upstream.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ["RS256"],
      secretOrKey: (config.get<string>("JWT_ACCESS_PUBLIC_KEY") ?? "").replace(/\\n/g, "\n"),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
