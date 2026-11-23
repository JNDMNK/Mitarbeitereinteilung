import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id mit OWASP-Empfehlung (19 MiB, 2 Durchläufe)
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Gleicht die Antwortzeit bei unbekanntem Benutzernamen an */
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
}
