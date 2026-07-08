import { Test } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Sprint 1 smoke test: proves the module/DI wiring works end to end
 * (docs/ARCHITECT_AUDIT.md Sprint 1 scope — no business logic to test yet).
 */
describe("HealthController", () => {
  it("returns ok when the database responds", async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it("throws ServiceUnavailableException when the database is unreachable", async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error("connection refused")) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    const controller = moduleRef.get(HealthController);

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
