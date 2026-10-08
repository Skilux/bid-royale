import test from "node:test";
import assert from "node:assert/strict";
import { EVENTS } from "../board/index.js";
import { createFixtureBoard } from "../board/worked-example.js";
import { createBidSource, bidSourceFromEnv, httpInvite } from "../supplier-agents/bid-source.js";
import { createRegistryClient } from "../masumi/registry.js";
import { EXPECTED, discoverSuppliers, inviteUrls, seededAgents, supplierIdOf } from "./index.js";

const CONTRACT = "addr_test1wzqgalcd93sfjrc5tsc4ycwx80a8lt0s3767a4g8nh45lrg044nd9";
const ENV = {
  MASUMI_REGISTRY_BASE_URL: "https://node.test/api/v1",
  MASUMI_REGISTRY_API_KEY: "read-only-key",
  MASUMI_SMART_CONTRACT_ADDRESS: CONTRACT,
  MASUMI_NETWORK: "Preprod",
};
const APP = "https://ad-slot-auction.vercel.app/api/agents";

const entry = (id, over = {}) => ({
  name: id === "board" ? "Tender Board" : id,
  agentIdentifier: `agent_${id}`,
  apiBaseUrl: `${APP}/${id}`,
  state: "RegistrationConfirmed",
  ...over,
});
const ALL = ["techblog", "codepodcast", "devnewsletter", "gamingforum", "board"].map((id) => entry(id));

/** Fetch fake for the registry node. Records every request. */
function node(entries, { status = 200, hang = false, body } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (hang) return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    return new Response(JSON.stringify(body ?? { status: "success", data: { Assets: entries } }), { status });
  };
  return { fetch, calls };
}

test("live: 4 supplier agents with agentIdentifier and apiBaseUrl, Board agent excluded, V2 selector and Read key sent", async () => {
  const { fetch, calls } = node(ALL);
  const d = await discoverSuppliers({ env: ENV, fetch });

  assert.equal(d.source, "live");
  assert.equal(d.label, "Masumi registry");
  assert.equal(d.found, 4);
  assert.deepEqual(d.agents.map((a) => a.supplier), ["techblog", "codepodcast", "devnewsletter", "gamingforum"]);
  for (const a of d.agents) {
    assert.match(a.agentIdentifier, /^agent_/);
    assert.equal(a.apiBaseUrl, `${APP}/${a.supplier}`);
  }
  assert.deepEqual(d.skipped, [{ name: "Tender Board", reason: "not_a_supplier" }]);

  assert.equal(calls.length, 1, "one read, no retry");
  assert.equal(calls[0].url.pathname, "/api/v1/registry");
  assert.equal(calls[0].url.searchParams.get("filterSmartContractAddress"), CONTRACT);
  assert.equal(calls[0].url.searchParams.get("network"), "Preprod");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.token, "read-only-key");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.ok(!JSON.stringify(d).includes("read-only-key"));
});

test("V1 vs V2: the V2 selector is always sent, the payment source type when no contract address is set", async () => {
  const { MASUMI_SMART_CONTRACT_ADDRESS: _drop, ...noContract } = ENV;
  const { fetch, calls } = node(ALL);
  await discoverSuppliers({ env: noContract, fetch });
  assert.equal(calls[0].url.searchParams.get("filterPaymentSourceType"), "Web3CardanoV2");
  assert.equal(calls[0].url.searchParams.has("filterSmartContractAddress"), false);
});

test("the registry base URL falls back to the payment node, the key never does", async () => {
  const { MASUMI_REGISTRY_BASE_URL: _drop, ...env } = { ...ENV, MASUMI_PAYMENT_BASE_URL: "https://pay.test/api/v1", MASUMI_PAYMENT_API_KEY: "party-key" };
  const { fetch, calls } = node(ALL);
  assert.equal((await discoverSuppliers({ env, fetch })).source, "live");
  assert.equal(calls[0].url.origin, "https://pay.test");
  assert.equal(calls[0].init.headers.token, "read-only-key");

  const noKey = { MASUMI_PAYMENT_BASE_URL: "https://pay.test/api/v1", MASUMI_PAYMENT_API_KEY: "party-key" };
  const none = node(ALL);
  const d = await discoverSuppliers({ env: noKey, fetch: none.fetch });
  assert.equal(d.reason, "not_configured");
  assert.equal(none.calls.length, 0, "a party key is never used for registry reads");
});

test("seeded: not configured, no network call, labelled seeded registry with 4 agents", async () => {
  const { fetch, calls } = node(ALL);
  const d = await discoverSuppliers({ env: {}, fetch });
  assert.equal(d.source, "seeded");
  assert.equal(d.label, "seeded registry");
  assert.equal(d.reason, "not_configured");
  assert.equal(d.agents.length, EXPECTED);
  assert.deepEqual(d.agents, seededAgents());
  assert.equal(calls.length, 0);
  for (const a of d.agents) assert.match(a.agentIdentifier, /^[0-9a-f]{120}$/);
});

test("timeout: aborts, seeds, does not retry", async () => {
  const { fetch, calls } = node([], { hang: true });
  const d = await discoverSuppliers({ env: ENV, fetch, timeoutMs: 20 });
  assert.equal(d.source, "seeded");
  assert.equal(d.reason, "timeout");
  assert.equal(d.agents.length, EXPECTED);
  assert.equal(calls.length, 1);
});

test("HTTP error and bad JSON seed, and the key is redacted from the detail", async () => {
  const http = await discoverSuppliers({ env: ENV, fetch: node([], { status: 401, body: { message: "bad key read-only-key" } }).fetch });
  assert.equal(http.reason, "error");
  assert.match(http.detail, /401/);
  assert.ok(!http.detail.includes("read-only-key"));
  const bad = await discoverSuppliers({ env: ENV, fetch: async () => new Response("<html>", { status: 200 }) });
  assert.equal(bad.source, "seeded");
});

test("partial: fewer than 4 usable agents seeds the whole list and says how many were found", async () => {
  const d = await discoverSuppliers({ env: ENV, fetch: node(ALL.slice(0, 3)).fetch });
  assert.equal(d.source, "seeded");
  assert.equal(d.reason, "partial");
  assert.equal(d.found, 3);
  assert.equal(d.agents.length, 4);
});

test("entries that are not confirmed, lack an identifier, use http or name another host are dropped", async () => {
  const bad = [
    entry("techblog", { state: "RegistrationInitiated" }),
    entry("codepodcast", { agentIdentifier: null }),
    entry("devnewsletter", { apiBaseUrl: "http://ad-slot-auction.vercel.app/api/agents/devnewsletter" }),
    entry("gamingforum", { apiBaseUrl: "https://evil.example/api/agents/gamingforum" }),
  ];
  const d = await discoverSuppliers({ env: ENV, fetch: node(bad).fetch });
  assert.equal(d.reason, "partial");
  assert.equal(d.found, 0);
  assert.deepEqual(d.skipped.map((s) => s.reason), ["not_confirmed", "no_agent_identifier", "no_https_url", "untrusted_origin"]);
  assert.ok(!JSON.stringify(inviteUrls(d)).includes("evil.example"));
});

test("a node answering with a bare array, an Online status and duplicates still works", async () => {
  const dup = [...ALL.map((e) => ({ ...e, state: undefined, status: "Online" })), entry("techblog", { agentIdentifier: "second" })];
  const d = await discoverSuppliers({ env: ENV, fetch: node(null, { body: { status: "success", data: dup } }).fetch });
  assert.equal(d.source, "live");
  assert.equal(d.agents.find((a) => a.supplier === "techblog").agentIdentifier, "agent_techblog");
});

test("supplier id comes from the URL path or the name; the Board agent is none", () => {
  assert.equal(supplierIdOf({ apiBaseUrl: `${APP}/codepodcast`, name: "x" }), "codepodcast");
  assert.equal(supplierIdOf({ apiBaseUrl: null, name: "Dev Newsletter" }), "devnewsletter");
  assert.equal(supplierIdOf({ apiBaseUrl: `${APP}/board`, name: "Tender Board" }), null);
});

test("registry client: not configured throws a coded error and calls nothing", async () => {
  const { fetch, calls } = node([]);
  await assert.rejects(createRegistryClient({ env: {}, fetch }).list(), { code: "not_configured" });
  assert.equal(calls.length, 0);
});

test("a Board run emits registry.discovered before the first invite and keeps the result on the run", async () => {
  const board = await createFixtureBoard();
  const created = await board.createRun();
  const run = await board.runAll(created.id);
  const events = await board.getEvents(run.id);
  const names = events.map((e) => e.name);
  const at = names.indexOf(EVENTS.registryDiscovered);

  assert.ok(at > names.indexOf(EVENTS.stepStarted), "inside the bids step");
  assert.ok(at < names.indexOf(EVENTS.bidCommitted), "before any bid");
  assert.equal(events[at].data.source, "seeded");
  assert.equal(events[at].data.agents.length, 4);
  assert.deepEqual(run.discovery, events[at].data);
});

test("a registry that throws does not stop the run: seeded, labelled, run completes", async () => {
  const board = await createFixtureBoard({
    discover: async () => {
      throw new Error("registry exploded");
    },
  });
  const run = await board.runAll((await board.createRun()).id);
  assert.equal(run.status, "completed");
  assert.equal(run.discovery.source, "seeded");
  assert.equal(run.discovery.reason, "error");
  assert.equal(run.discovery.agents.length, 4);
});

test("a live discovery result reaches the run unchanged, with its label", async () => {
  const { fetch } = node(ALL);
  const board = await createFixtureBoard({ discover: () => discoverSuppliers({ env: ENV, fetch }) });
  const run = await board.runAll((await board.createRun()).id);
  assert.equal(run.discovery.source, "live");
  assert.equal(run.discovery.label, "Masumi registry");
  assert.equal(run.discovery.found, 4);
});

test("SUPPLIER_AGENTS=http invites the discovered apiBaseUrl; SUPPLIER_INVITE_URLS wins when set", async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url: String(url), secret: init.headers["x-agent-secret"] });
    return new Response("{}", { status: 500 });
  };
  const discovery = { agents: [{ supplier: "techblog", apiBaseUrl: "https://a.test/api/agents/techblog" }, { supplier: "codepodcast", apiBaseUrl: "https://a.test/api/agents/codepodcast" }] };
  const tender = { budget: 200, gate: 5, bondRate: 0.25, bidFee: 2, currency: "tADA" };

  const http = bidSourceFromEnv({ SUPPLIER_AGENTS: "http", AGENT_SHARED_SECRET: "s3" }, { fetch });
  await http({ tender, run: { id: "r1" }, discovery });
  assert.deepEqual(seen.map((s) => s.url).sort(), ["https://a.test/api/agents/codepodcast/tender-invite", "https://a.test/api/agents/techblog/tender-invite"]);
  assert.ok(seen.every((s) => s.secret === "s3"));

  seen.length = 0;
  const override = bidSourceFromEnv({ SUPPLIER_INVITE_URLS: JSON.stringify({ techblog: "https://b.test/t" }), AGENT_SHARED_SECRET: "s3" }, { fetch });
  await override({ tender, run: { id: "r1" }, discovery });
  assert.ok(seen.some((s) => s.url === "https://b.test/t/tender-invite"));
  assert.ok(seen.some((s) => s.url === "https://a.test/api/agents/codepodcast/tender-invite"), "suppliers not in the override use discovery");
});

test("a supplier with no discovered URL fails its invite and falls back to the pinned quote", async () => {
  const bidSource = createBidSource({ invite: httpInvite({ fetch: async () => new Response("{}", { status: 500 }) }) });
  const quotes = await bidSource({ tender: { budget: 200, gate: 5, bondRate: 0.25, bidFee: 2, currency: "tADA" }, run: { id: "r" }, discovery: { agents: [] } });
  assert.equal(quotes.length, 4);
  assert.ok(quotes.every((q) => q.reason === "invite_error"));
});
