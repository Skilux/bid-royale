import test from "node:test";
import assert from "node:assert/strict";
import { probeTreasury } from "./probe.js";

const env = { TREASURY_URL: "https://treasury.example.test/", TREASURY_TOKEN: "tok-secret" };
const reply = (status, body) => async () => ({ status, json: async () => body });

test("unset URL is reported as not configured, with no request", async () => {
  let called = false;
  const out = await probeTreasury({ env: {}, fetch: async () => (called = true) });
  assert.deepEqual(out, { configured: false, reachable: false, status: null, authOk: null });
  assert.equal(called, false);
});

test("right token: worker answers 404 NotFound, authOk true, bearer sent to the authenticated route", async () => {
  let seen;
  const out = await probeTreasury({
    env,
    fetch: async (url, init) => {
      seen = { url, init };
      return { status: 404, json: async () => ({ id: "health-probe", state: "NotFound" }) };
    },
  });
  assert.deepEqual(out, { configured: true, reachable: true, status: 404, authOk: true });
  assert.equal(seen.url, "https://treasury.example.test/transfers/health-probe");
  assert.equal(seen.init.headers.Authorization, "Bearer tok-secret");
  assert.equal(seen.init.method, "GET");
  assert.ok(seen.init.signal);
});

test("wrong token: 401 gives authOk false", async () => {
  assert.deepEqual(await probeTreasury({ env, fetch: reply(401, { error: "Unauthorized" }) }), {
    configured: true, reachable: true, status: 401, authOk: false,
  });
});

test("an answer that is not the worker leaves authOk null", async () => {
  assert.equal((await probeTreasury({ env, fetch: reply(404, { message: "page not found" }) })).authOk, null);
  assert.equal((await probeTreasury({ env, fetch: reply(502, null) })).authOk, null);
  assert.equal((await probeTreasury({ env, fetch: async () => ({ status: 200, json: async () => { throw new Error("html"); } }) })).authOk, null);
});

test("no token: probes /health, authOk null", async () => {
  let url;
  const out = await probeTreasury({ env: { TREASURY_URL: "https://t.test" }, fetch: async (u) => ((url = u), { status: 200 }) });
  assert.equal(url, "https://t.test/health");
  assert.deepEqual(out, { configured: true, reachable: true, status: 200, authOk: null });
});

test("network error and timeout are unreachable and never throw", async () => {
  const down = await probeTreasury({ env, fetch: async () => { throw new Error("ECONNREFUSED treasury.example.test"); } });
  assert.deepEqual(down, { configured: true, reachable: false, status: null, authOk: null });
  const slow = await probeTreasury({
    env,
    timeoutMs: 20,
    fetch: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
  });
  assert.equal(slow.reachable, false);
});

test("the result never contains the URL or the token", async () => {
  for (const f of [reply(404, { state: "NotFound" }), reply(401, {}), async () => { throw new Error(`boom ${env.TREASURY_URL} ${env.TREASURY_TOKEN}`); }]) {
    const text = JSON.stringify(await probeTreasury({ env, fetch: f }));
    assert.ok(!text.includes("treasury.example.test") && !text.includes("tok-secret"));
  }
});
