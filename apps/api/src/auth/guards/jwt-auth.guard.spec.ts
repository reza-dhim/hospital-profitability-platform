import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  const context = { getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;

  it("allows the request without invoking passport when the route is @Public()", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const mixinProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (...args: unknown[]) => unknown;
    };
    const superSpy = jest.spyOn(mixinProto, "canActivate");

    expect(guard.canActivate(context)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
    superSpy.mockRestore();
  });

  it("delegates to the passport strategy when the route is not @Public()", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const mixinProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (...args: unknown[]) => unknown;
    };
    const superSpy = jest.spyOn(mixinProto, "canActivate").mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(superSpy).toHaveBeenCalledWith(context);
    superSpy.mockRestore();
  });
});
