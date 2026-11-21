import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummySalt = Buffer.alloc(16);
const dummyHash = Buffer.alloc(64);
let running = 0;

export class PasswordServiceBusy extends Error {}

async function derive(password: string, salt: Buffer) {
  if (running >= 4) throw new PasswordServiceBusy();
  running++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, options, (error, value) => error ? reject(error) : resolve(value));
    });
  } finally { running--; }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const digest = await derive(password, salt);
  return ["scrypt-v1", salt.toString("hex"), digest.toString("hex")].join("$");
}

export async function verifyPassword(password: string, stored?: string) {
  const [format, salt, hash] = stored?.split("$") ?? [];
  if (format !== "scrypt-v1" || !/^[0-9a-f]{32}$/.test(salt ?? "") || !/^[0-9a-f]{128}$/.test(hash ?? "")) {
    timingSafeEqual(await derive(password, dummySalt), dummyHash);
    return false;
  }
  return timingSafeEqual(await derive(password, Buffer.from(salt, "hex")), Buffer.from(hash, "hex"));
}

export const sessionToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
