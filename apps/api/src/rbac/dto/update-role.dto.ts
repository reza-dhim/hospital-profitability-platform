import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** Renaming is blocked for default roles (docs/04_RBAC.md §1) — see RoleService.update. */
export class UpdateRoleDto {
  @ApiPropertyOptional({ example: "billing_clerk" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ example: "Handles patient billing inquiries." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
