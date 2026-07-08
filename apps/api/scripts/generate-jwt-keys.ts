import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generates a local-dev RSA keypair for RS256-signed access tokens
 * (docs/05_AUTHENTICATION.md §1) and writes it into apps/api/.env. Never run
 * against a shared/production .env — each environment should have its own
 * keypair, generated once and kept secret, not regenerated on every deploy
 * (that would invalidate every outstanding access token).
 */
function toEnvValue(pem: string): string {
  return pem.trim().replace(/\n/g, "\\n");
}

function upsertEnvVar(contents: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }
  const separator = contents.endsWith("\n") || contents.length === 0 ? "" : "\n";
  return `${contents}${separator}${line}\n`;
}

function main() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const envPath = join(__dirname, "..", ".env");
  const envExamplePath = join(__dirname, "..", ".env.example");
  let contents = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : readFileSync(envExamplePath, "utf8");

  contents = upsertEnvVar(contents, "JWT_ACCESS_PRIVATE_KEY", toEnvValue(privateKey));
  contents = upsertEnvVar(contents, "JWT_ACCESS_PUBLIC_KEY", toEnvValue(publicKey));

  writeFileSync(envPath, contents, "utf8");
  // eslint-disable-next-line no-console
  console.log(`RSA keypair written to ${envPath}. Restart the API for it to take effect.`);
}

main();
