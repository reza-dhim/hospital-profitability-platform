import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes and verifies a matching password", async () => {
    const hash = await service.hash("correct-horse-battery-staple");
    await expect(service.verify(hash, "correct-horse-battery-staple")).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await service.hash("correct-horse-battery-staple");
    await expect(service.verify(hash, "wrong-password")).resolves.toBe(false);
  });

  it("produces an argon2id hash, per docs/05_AUTHENTICATION.md §3", async () => {
    const hash = await service.hash("correct-horse-battery-staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("returns false instead of throwing for a malformed hash", async () => {
    await expect(service.verify("not-a-real-hash", "anything")).resolves.toBe(false);
  });
});
