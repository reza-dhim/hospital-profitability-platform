import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { AllocationController } from "./allocation.controller";
import { AllocationRunService } from "./allocation-run.service";
import { AllocationEngineService } from "./allocation-engine.service";
import { AllocationEngineProcessor } from "./allocation-engine.processor";

/** Imports `ProfitabilityModule` so `AllocationEngineProcessor` can dispatch the chained `profitability.compute` job. */
@Module({
  imports: [ProfitabilityModule],
  controllers: [AllocationController],
  providers: [AllocationRunService, AllocationEngineService, AllocationEngineProcessor],
  exports: [AllocationRunService],
})
export class AllocationModule {}
