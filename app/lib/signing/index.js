import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

// Ed25519 keys are derived from a secret string: seed = SHA-256(secret), wrapped in the
// fixed PKCS#8 / SPKI DER prefixes for Ed25519 so node:crypto can import it.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function privateKeyFromSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("signing secret is missing: set it in .env.local or Vercel env vars");
  }
  const seed = createHash("sha256").update(secret).digest();
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
}

/** Accepts a KeyObject, a PEM string, or 32 raw bytes as 64 hex chars. */
export function toPublicKey(key) {
  if (typeof key === "string" && /^[0-9a-f]{64}$/i.test(key)) {
    return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(key, "hex")]), format: "der", type: "spki" });
  }
  return key?.type === "public" ? key : createPublicKey(key);
}

export function publicKeyFromSecret(secret) {
  return createPublicKey(privateKeyFromSecret(secret));
}

export function publicKeyHex(key) {
  return toPublicKey(key).export({ format: "der", type: "spki" }).subarray(SPKI_PREFIX.length).toString("hex");
}

export function signText(privateKey, text) {
  return sign(null, Buffer.from(text), privateKey).toString("hex");
}

export function verifyText(publicKey, text, signatureHex) {
  if (typeof signatureHex !== "string" || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    return verify(null, Buffer.from(text), toPublicKey(publicKey), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export const eventPayload = ({ eventId, sessionId, supplier, ts }) => `${eventId}|${sessionId}|${supplier}|${ts}`;

export function shopKey(secret = process.env.SHOP_SIGNING_KEY) {
  return privateKeyFromSecret(secret);
}

export function boardKey(secret = process.env.BOARD_SIGNING_KEY) {
  return privateKeyFromSecret(secret);
}
