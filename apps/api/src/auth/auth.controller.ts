import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService, type IssuedTokens, type RequestContext } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { AuthTokensDto } from "./dto/auth-tokens.dto";
import { CurrentUserDto } from "./dto/current-user.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_PATH } from "./auth.constants";
import type { JwtPayload } from "./types/jwt-payload.type";

function requestContext(req: Request): RequestContext {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  };
}

/** docs/05_AUTHENTICATION.md §2. */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate with email and password." })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: "Invalid email or password." })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthTokensDto> {
    const tokens = await this.authService.login(dto.email, dto.password, requestContext(req));
    return this.respondWithTokens(tokens, res);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE_NAME)
  @ApiOperation({ summary: "Rotate the refresh token and issue a new access token." })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: "Refresh token missing, invalid, expired, or already used." })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthTokensDto> {
    const raw = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
    if (!raw) {
      throw new UnauthorizedException({
        code: "AUTH_INVALID_REFRESH_TOKEN",
        message: "No refresh token cookie present.",
      });
    }
    const tokens = await this.authService.refresh(raw, requestContext(req));
    return this.respondWithTokens(tokens, res);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh token and clear its cookie." })
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
    await this.authService.logout(raw);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: REFRESH_TOKEN_COOKIE_PATH });
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the authenticated user, active hospital, and resolved permissions." })
  @ApiOkResponse({ type: CurrentUserDto })
  async me(@CurrentUser() user: JwtPayload): Promise<CurrentUserDto> {
    return this.authService.getCurrentUser(user.sub);
  }

  private respondWithTokens(tokens: IssuedTokens, res: Response): AuthTokensDto {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "strict",
      path: REFRESH_TOKEN_COOKIE_PATH,
      expires: tokens.refreshTokenExpiresAt,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
}
