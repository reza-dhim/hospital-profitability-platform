import { Module } from "@nestjs/common";
import { ProfitabilityController } from "./profitability.controller";

@Module({
  controllers: [ProfitabilityController],
})
export class ProfitabilityModule {}
