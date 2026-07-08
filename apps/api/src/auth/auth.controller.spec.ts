import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import type { AuthService, IssuedTokens } from "./auth.service";
import type { CurrentUserDto } from "./dto/current-user.dto";
import type { JwtPayload } from "./types/jwt-payload.type";

function makeRes(): Response {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
}

function makeReq(cookies: Record<string, string> = {}): Request {
  return { headers: { "user-agent": "jest" }, ip: "127.0.0.1", cookies } as unknown as Request;
}

const issuedTokens: IssuedTokens = {
  accessToken: "access-token",
  expiresIn: 900,
  refreshToken: "raw-refresh-token",
  refreshTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
};

describe("AuthController", () => {
  const config = { get: jest.fn().mockReturnValue("development") } as unknown as ConfigService;

  it("login sets the httpOnly refresh cookie and returns the access token body", async () => {
    const authService = { login: jest.fn().mockResolvedValue(issuedTokens) } as unknown as AuthService;
    const controller = new AuthController(authService, config);
    const res = makeRes();

    const result = await controller.login({ email: "a@b.com", password: "pw" }, makeReq(), res);

    expect(result).toEqual({ accessToken: "access-token", expiresIn: 900 });
    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      "raw-refresh-token",
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/api/v1/auth" })
    );
  });

  it("refresh reads the cookie and rotates tokens", async () => {
    const authService = { refresh: jest.fn().mockResolvedValue(issuedTokens) } as unknown as AuthService;
    const controller = new AuthController(authService, config);
    const res = makeRes();

    await controller.refresh(makeReq({ refresh_token: "old-token" }), res);

    expect(authService.refresh).toHaveBeenCalledWith("old-token", expect.any(Object));
    expect(res.cookie).toHaveBeenCalled();
  });

  it("refresh without a cookie throws before calling the service", async () => {
    const authService = { refresh: jest.fn() } as unknown as AuthService;
    const controller = new AuthController(authService, config);

    await expect(controller.refresh(makeReq(), makeRes())).rejects.toThrow(UnauthorizedException);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it("logout revokes the token and clears the cookie", async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) } as unknown as AuthService;
    const controller = new AuthController(authService, config);
    const res = makeRes();

    await controller.logout(makeReq({ refresh_token: "old-token" }), res);

    expect(authService.logout).toHaveBeenCalledWith("old-token");
    expect(res.clearCookie).toHaveBeenCalledWith("refresh_token", expect.objectContaining({ path: "/api/v1/auth" }));
  });

  it("me delegates to authService.getCurrentUser with the token's subject", async () => {
    const dto = { id: "user-1" } as CurrentUserDto;
    const authService = { getCurrentUser: jest.fn().mockResolvedValue(dto) } as unknown as AuthService;
    const controller = new AuthController(authService, config);

    const result = await controller.me({ sub: "user-1" } as JwtPayload);

    expect(authService.getCurrentUser).toHaveBeenCalledWith("user-1");
    expect(result).toBe(dto);
  });
});
