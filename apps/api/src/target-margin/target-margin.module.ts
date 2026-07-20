import { Module } from "@nestjs/common";
import { TargetMarginController } from "./target-margin.controller";
import { TargetMarginService } from "./target-margin.service";

@Module({
  controllers: [TargetMarginController],
  providers: [TargetMarginService],
  exports: [TargetMarginService],
})
export class TargetMarginModule {}
