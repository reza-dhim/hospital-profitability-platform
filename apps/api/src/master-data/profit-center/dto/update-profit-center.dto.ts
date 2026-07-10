import { PartialType } from "@nestjs/swagger";
import { CreateProfitCenterDto } from "./create-profit-center.dto";

export class UpdateProfitCenterDto extends PartialType(CreateProfitCenterDto) {}
