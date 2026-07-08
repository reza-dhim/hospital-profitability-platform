import { NotImplementedException } from "@nestjs/common";

/**
 * Placeholder body for Sprint 1's bounded-context module skeletons
 * (docs/ARCHITECT_AUDIT.md Sprint 1). Proves the module/controller/routing
 * wiring exists without implementing the module's business logic, which is
 * explicitly out of scope until the sprint that owns that module.
 */
export function notImplemented(module: string): never {
  throw new NotImplementedException(`${module} module is scaffolded but not implemented until its own sprint.`);
}
