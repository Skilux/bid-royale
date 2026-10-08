import { sha256Hex } from "./index.js";

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit, no whitespace, `undefined` object members dropped,
 * numbers and strings written by JSON.stringify. Non-finite numbers and non-JSON values throw, so a hash never
 * covers something that cannot be stored and re-read.
 */
export function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: cannot serialise ${typeof value}`);
}

/** The exact UTF-8 bytes that get hashed and stored. */
export const canonicalBytes = (value) => Buffer.from(canonicalJson(value), "utf8");

/** Canonical text, its byte length and its SHA-256 hex. Store `text` next to `hash`: the hash is of exactly these bytes. */
export function canonicalHash(value) {
  const bytes = canonicalBytes(value);
  return { text: bytes.toString("utf8"), size: bytes.length, hash: sha256Hex(bytes) };
}
