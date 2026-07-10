import { PartialType } from "@nestjs/swagger";
import { CreateBmhpItemDto } from "./create-bmhp-item.dto";

export class UpdateBmhpItemDto extends PartialType(CreateBmhpItemDto) {}
