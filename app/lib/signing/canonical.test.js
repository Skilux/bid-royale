import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHash, canonicalJson } from "./canonical.js";

// Test vector: the bytes below were hashed with `shasum -a 256`, not with this code.
const VECTOR_TEXT = '{"a":2,"b":[true,null,"é"],"z":{"m":1,"n":-0.5}}';
const VECTOR_HASH = "0c4e84a6077292350b31efbd0eedfea39025de93caa71eced02e53498a93b3dd";

test("canonical JSON sorts keys, drops whitespace and undefined members", () => {
  const value = { z: { n: -0.5, m: 1 }, b: [true, null, "é"], a: 2, skipped: undefined };
  assert.equal(canonicalJson(value), VECTOR_TEXT);
});

test("test vector: same input gives the same bytes and the same hash, whatever the key order", () => {
  const one = canonicalHash({ a: 2, b: [true, null, "é"], z: { m: 1, n: -0.5 } });
  const two = canonicalHash({ z: { n: -0.5, m: 1 }, b: [true, null, "é"], a: 2 });
  assert.equal(one.text, VECTOR_TEXT);
  assert.equal(one.hash, VECTOR_HASH);
  assert.deepEqual(two, one);
  assert.equal(one.size, Buffer.byteLength(VECTOR_TEXT, "utf8"));
});

test("an undefined array member becomes null, as in JSON", () => {
  assert.equal(canonicalJson([1, undefined]), "[1,null]");
});

test("values that are not JSON throw instead of hashing something unreadable", () => {
  assert.throws(() => canonicalJson({ n: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalJson({ f() {} }), /cannot serialise/);
  assert.throws(() => canonicalJson(10n), /cannot serialise/);
});
