import { PartialType } from "@nestjs/swagger";
import { CreateCoaAccountDto } from "./create-coa-account.dto";

export class UpdateCoaAccountDto extends PartialType(CreateCoaAccountDto) {}
