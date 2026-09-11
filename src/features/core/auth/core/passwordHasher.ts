import crypto from "node:crypto";

export function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize(), salt, 64, (error, hash) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(hash.toString("hex").normalize());
    });
  });
}

export async function comparePasswords({
  password,
  salt,
  hashedPassword,
}: {
  password: string;
  salt: string;
  hashedPassword: string;
}) {
  const inputHashedPassword = await hashPassword(password, salt);
  const inputBuffer = Buffer.from(inputHashedPassword, "hex");
  const storedBuffer = Buffer.from(hashedPassword, "hex");

  // timingSafeEqual throws on mismatched lengths instead of returning false —
  // guard it so a corrupted/foreign hash fails the comparison, not the request.
  if (inputBuffer.length !== storedBuffer.length) return false;

  return crypto.timingSafeEqual(inputBuffer, storedBuffer);
}

export function generateSalt() {
  return crypto.randomBytes(16).toString("hex").normalize();
}
