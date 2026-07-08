import { ApiProperty } from "@nestjs/swagger";

/**
 * Login/refresh response body. The refresh token itself is never in the
 * body — only delivered as an httpOnly cookie (docs/05_AUTHENTICATION.md §1).
 */
export class AuthTokensDto {
  @ApiProperty({ description: "RS256-signed JWT access token." })
  accessToken!: string;

  @ApiProperty({ description: "Access token lifetime in seconds.", example: 900 })
  expiresIn!: number;
}
