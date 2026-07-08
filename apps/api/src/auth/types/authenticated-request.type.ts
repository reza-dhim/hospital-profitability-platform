import type { Request } from "express";
import type { JwtPayload } from "./jwt-payload.type";

/** `request.user` is populated by JwtStrategy.validate() once JwtAuthGuard passes. */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
