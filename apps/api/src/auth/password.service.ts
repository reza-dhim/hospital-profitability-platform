import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/** Argon2id password hashing, per docs/05_AUTHENTICATION.md §3 ("argon2id preferred"). */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // A malformed/foreign hash format throws in argon2 — treat as "does not match"
      // rather than letting it surface as a 500.
      return false;
    }
  }
}
