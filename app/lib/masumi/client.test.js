import test from "node:test";
import assert from "node:assert/strict";
import { installNextResolution } from "../board/test-alias.js";
installNextResolution();
const { createClient } = await import("@/lib/masumi/client");

const response = (data, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(data) });
const options = { baseUrl: "https://masumi.invalid/api/v1", token: "test-party" };

test("client times out and aborts fetch", async () => {
  let aborted = false;
  const client = createClient({ ...options, timeoutMs: 5, fetch: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
  }) });
  await assert.rejects(client.request("/payment"), /timed out after 5 ms/);
  assert.equal(aborted, true);
});

test("non-2xx surfaces HTTP status and JSON message with token redacted", async () => {
  const client = createClient({ ...options, fetch: async () => response({ message: "bad test-party" }, 403) });
  await assert.rejects(client.request("/payment"), (error) => error.status === 403 && error.message === "Masumi HTTP 403: bad [redacted]");
});

test("retry queries status before resending a mutation, preserving body and party header", async () => {
  const calls = [];
  const client = createClient({ ...options, fetch: async (url, init) => {
    calls.push({ path: url.pathname, ...init });
    if (calls.length === 1) return response({ message: "temporarily unavailable" }, 503);
    return response({ data: calls.length === 2 ? { absent: true } : { id: "purchase" } });
  } });
  assert.deepEqual(await client.post("/purchase", { nonce: "abc" }, {
    retry: { query: { path: "/purchase", query: { network: "Preprod" } }, decide: (data) => ({ retry: data.absent === true }) },
  }), { id: "purchase" });
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "POST"]);
  assert.equal(calls[0].body, calls[2].body);
  assert.ok(calls.every((call) => call.headers.token === options.token && call.signal));
});

test("reconciliation of accepted purchase returns existing result without a duplicate POST", async () => {
  const calls = [];
  const client = createClient({ ...options, fetch: async (url, init) => {
    calls.push(init.method);
    if (calls.length === 1) throw new Error("connection lost");
    return response({ data: { id: "existing" } });
  } });
  assert.deepEqual(await client.post("/purchase", {}, {
    retry: { query: { path: "/purchase" }, decide: (data) => ({ data }) },
  }), { id: "existing" });
  assert.deepEqual(calls, ["POST", "GET"]);
});

test("no blind retry on purchase failure or ambiguous status", async () => {
  let calls = 0;
  const client = createClient({ ...options, fetch: async () => {
    calls++;
    if (calls === 1) throw new Error("lost");
    return response({ data: {} });
  } });
  await assert.rejects(client.post("/purchase", {}), /lost/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(client.post("/purchase", {}, {
    retry: { query: { path: "/purchase" }, decide: () => ({}) },
  }), /lost/);
  assert.equal(calls, 2);
});

test("HTML 502 errors preserve HTTP status and a clear non-JSON message", async () => {
  const client = createClient({ ...options, fetch: async () => new Response("<html>Bad Gateway</html>", { status: 502 }) });
  await assert.rejects(client.request("/payment"), (error) => error.status === 502 && error.message === "Masumi HTTP 502: non-JSON response");
});

test("HTML 502 retry reconciles status before another mutation", async () => {
  const calls = [];
  const client = createClient({ ...options, fetch: async (url, init) => {
    calls.push(init.method);
    if (calls.length === 1) return new Response("<html>Bad Gateway</html>", { status: 502 });
    return response({ data: calls.length === 2 ? { absent: true } : { id: "purchase" } });
  } });
  assert.deepEqual(await client.post("/purchase", {}, {
    retry: { query: { path: "/purchase" }, decide: (status) => ({ retry: status.absent === true }) },
  }), { id: "purchase" });
  assert.deepEqual(calls, ["POST", "GET", "POST"]);
});
