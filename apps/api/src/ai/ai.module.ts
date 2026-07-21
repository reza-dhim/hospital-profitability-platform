import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiController } from "./ai.controller";
import { WhatIfSimulationService } from "./what-if-simulation.service";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [WhatIfSimulationService],
})
export class AiModule {}
