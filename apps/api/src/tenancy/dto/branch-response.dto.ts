import { ApiProperty } from "@nestjs/swagger";

export class BranchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
