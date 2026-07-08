import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the whole app. Tenant scoping (docs/03_MULTI_TENANT.md §2)
 * — setting `app.current_org_id`/`app.current_hospital_id` session variables for RLS —
 * is wired once an authenticated request path exists (Sprint 2), not here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Database connection established");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
