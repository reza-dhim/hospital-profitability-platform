import { ApiProperty } from "@nestjs/swagger";

export class PermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() module!: string;
}
