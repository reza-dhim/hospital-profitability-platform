import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/** Route requires the caller's role (JWT `role` claim) to be one of `roles`. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
