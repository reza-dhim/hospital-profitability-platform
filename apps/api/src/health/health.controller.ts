import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/decorators/public.decorator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Infra health checks must stay unauthenticated (docs/30_MONITORING.md §4). */
  @Public()
  @Get()
  @ApiOkResponse({ description: "Service and database are healthy." })
  @ApiServiceUnavailableResponse({ description: "Database is unreachable." })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Database connection failed");
    }

    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
