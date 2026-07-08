import { ApiProperty } from "@nestjs/swagger";

class CurrentUserOrganizationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class CurrentUserHospitalDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

class CurrentUserRoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

/** GET /auth/me response — "current user, active hospital, resolved role/permissions" per docs/05_AUTHENTICATION.md §2. */
export class CurrentUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: CurrentUserOrganizationDto })
  organization!: CurrentUserOrganizationDto;
  @ApiProperty({ type: CurrentUserHospitalDto, nullable: true })
  hospital!: CurrentUserHospitalDto | null;
  @ApiProperty({ type: CurrentUserRoleDto, nullable: true })
  role!: CurrentUserRoleDto | null;
  @ApiProperty({ type: [String] })
  permissions!: string[];
}
