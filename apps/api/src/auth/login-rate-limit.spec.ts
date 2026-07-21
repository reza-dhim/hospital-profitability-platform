import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerException, ThrottlerGuard } from "@nestjs/throttler";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { AuthController } from "./auth.controller";

/** Not exported from the package's public entrypoint (only `ThrottlerStorage` is) — shape confirmed against the installed version's `throttler-storage-record.interface.d.ts`. */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Minimal, correct-enough reimplementation of the package's default
 * in-memory storage (not exported directly, only reachable via DI) — just
 * enough of `ThrottlerStorage` for `ThrottlerGuard.handleRequest` to compute
 * `isBlocked` the same way the real one does.
 */
class InMemoryThrottlerStorage implements ThrottlerStorage {
  private readonly hits = new Map<string, number>();

  async increment(key: string, ttl: number, limit: number): Promise<ThrottlerStorageRecord> {
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    return { totalHits, timeToExpire: ttl, isBlocked: totalHits > limit, timeToBlockExpire: ttl };
  }
}

function makeContext(ip: string): ExecutionContext {
  const req = { ip, headers: { "user-agent": "jest" } };
  const res = { header: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    // The real `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on
    // `AuthController.login` (docs/14_SECURITY.md §3) — reading the actual
    // decorated method means this test breaks if that config value ever
    // silently drifts, not just a hand-copied number.
    getHandler: () => AuthController.prototype.login,
    getClass: () => AuthController,
  } as unknown as ExecutionContext;
}

async function buildGuard() {
  const guard = new ThrottlerGuard([{ ttl: 60_000, limit: 5 }], new InMemoryThrottlerStorage(), new Reflector());
  await guard.onModuleInit();
  return guard;
}

describe("POST /auth/login rate limiting", () => {
  it("allows requests up to the configured limit, then throws on the next one", async () => {
    const guard = await buildGuard();

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(guard.canActivate(makeContext("203.0.113.1"))).resolves.toBe(true);
    }
    await expect(guard.canActivate(makeContext("203.0.113.1"))).rejects.toThrow(ThrottlerException);
  });

  it("tracks the limit independently per IP — a blocked IP doesn't affect another", async () => {
    const guard = await buildGuard();

    for (let attempt = 0; attempt < 5; attempt++) {
      await guard.canActivate(makeContext("203.0.113.1"));
    }
    await expect(guard.canActivate(makeContext("203.0.113.1"))).rejects.toThrow(ThrottlerException);

    await expect(guard.canActivate(makeContext("203.0.113.2"))).resolves.toBe(true);
  });
});
