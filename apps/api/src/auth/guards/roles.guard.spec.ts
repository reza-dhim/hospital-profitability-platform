import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function makeContext(user: { role: string | null } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("allows the request when no @Roles metadata is present", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext({ role: "tim_costing" }))).toBe(true);
  });

  it("allows the request when the user's role is in the required list", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["system_admin", "cfo_finance_director"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext({ role: "system_admin" }))).toBe(true);
  });

  it("denies the request when the user's role is not in the required list", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["system_admin"]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext({ role: "tim_costing" }))).toBe(false);
  });

  it("denies the request when there is no user on the request", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["system_admin"]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});
