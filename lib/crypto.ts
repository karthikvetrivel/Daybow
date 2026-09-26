import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string, secret: string): string {
  const [ivB, tagB, ctB] = blob.split(".");
  if (!ivB || !tagB || !ctB) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}

/** HMAC-signed opaque token: base64url(payload).base64url(signature) */
export function sign(payload: string, secret: string): string {
  const body = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", keyFrom(secret)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify(token: string | undefined | null, secret: string): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", keyFrom(secret)).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
