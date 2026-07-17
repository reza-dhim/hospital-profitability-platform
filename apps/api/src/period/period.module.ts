import { Module } from "@nestjs/common";
import { PeriodController } from "./period.controller";
import { PeriodService } from "./period.service";

/**
 * Configuration group (docs/02_DOMAIN_MODEL.md §1), not Master Data — split
 * out from `MasterDataModule` since periods carry real state-machine
 * business logic (docs/25_PERIOD_CLOSING.md) rather than generic CRUD, and
 * are a prerequisite bounded context for Sprint 4 (Upload) and Sprint 5
 * (Cost Allocation), both of which need `PeriodService` injected directly.
 */
@Module({
  controllers: [PeriodController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodModule {}
