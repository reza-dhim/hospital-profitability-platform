import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "superadmin@contoh.local" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "ChangeMe123!Dev" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
