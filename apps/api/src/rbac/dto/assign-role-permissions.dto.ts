import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsString } from "class-validator";

/** Replaces the role's full permission set with exactly these codes. */
export class AssignRolePermissionsDto {
  @ApiProperty({ type: [String], example: ["master_data.read", "profitability.read"] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes!: string[];
}
