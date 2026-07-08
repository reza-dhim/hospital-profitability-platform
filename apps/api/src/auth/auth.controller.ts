import { Controller, Post } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** Full mechanism: docs/05_AUTHENTICATION.md. Implemented in Sprint 2. */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  @Post("login")
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 2 — docs/05_AUTHENTICATION.md" })
  login() {
    notImplemented("Auth");
  }
}
