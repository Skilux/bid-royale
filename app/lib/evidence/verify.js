// Browser-safe: Web Crypto only, no node: imports. The Evidence panel runs this on the stored bytes.

const encoder = new TextEncoder();

export async function sha256Text(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same field order as the verifier's verdict hash (lib/verifier). A test keeps the two in step. */
export const verdictPreimage = (v) => JSON.stringify([v.supplier, v.kind, v.delivered, v.promised, v.gate, v.award, v.bond]);

/** Extra checks for items that carry a second hash inside their bytes. Each returns `{label, ok}` or null. */
const EXTRA = {
  async verdict(item, parsed) {
    const v = parsed?.verdict;
    if (!v?.hash) return null;
    return { label: "The verdict hash matches the verdict fields", ok: (await sha256Text(verdictPreimage(v))) === v.hash };
  },
};

/**
 * Recomputes an item's hash from its stored bytes. `item` is `{hash, size, bytes, name}`.
 * Returns `{ok, expected, actual, checks}`. `ok` is true only when every check passes.
 */
export async function verifyItem(item) {
  const bytes = typeof item?.bytes === "string" ? item.bytes : null;
  if (bytes === null || typeof item.hash !== "string") {
    return { ok: false, expected: item?.hash ?? null, actual: null, checks: [{ label: "The item has stored bytes and a hash", ok: false }] };
  }
  const actual = await sha256Text(bytes);
  const checks = [{ label: "The stored bytes hash to the listed hash", ok: actual === item.hash }];
  if (Number.isInteger(item.size)) {
    checks.push({ label: "The stored size matches", ok: encoder.encode(bytes).length === item.size });
  }
  let parsed = null;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    checks.push({ label: "The stored bytes are valid JSON", ok: false });
  }
  const extra = EXTRA[String(item.name).split(".")[0]];
  if (parsed && extra) {
    const result = await extra(item, parsed);
    if (result) checks.push(result);
  }
  return { ok: checks.every((c) => c.ok), expected: item.hash, actual, checks };
}
