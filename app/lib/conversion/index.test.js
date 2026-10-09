import test from "node:test";
import assert from "node:assert/strict";
import { formatConversion } from "./index.js";

test("signups per 1,000 read as a conversion percent", () => {
  assert.equal(formatConversion(5), "0.5%");
  assert.equal(formatConversion(12), "1.2%");
  assert.equal(formatConversion(0), "0%");
  assert.equal(formatConversion(6.667), "0.67%");
  assert.equal(formatConversion(50), "5%");
});

test("a missing rate shows a dot", () => {
  assert.equal(formatConversion(null), "·");
  assert.equal(formatConversion(Number.NaN), "·");
});
