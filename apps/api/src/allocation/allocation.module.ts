import { Module } from "@nestjs/common";
import { AllocationController } from "./allocation.controller";
import { AllocationRunService } from "./allocation-run.service";
import { AllocationEngineService } from "./allocation-engine.service";
import { AllocationEngineProcessor } from "./allocation-engine.processor";

@Module({
  controllers: [AllocationController],
  providers: [AllocationRunService, AllocationEngineService, AllocationEngineProcessor],
  exports: [AllocationRunService],
})
export class AllocationModule {}
