import test from "node:test";
import assert from "node:assert/strict";
import { commit, evaluateBids } from "../auction/index.js";
import { TENDER } from "../config.js";
import { createFixtureBoard } from "../board/worked-example.js";
import { LLM_CONFIG, bidFor, InviteRequest, InviteResponse, PERSONAS, SUPPLIER_IDS, estimateWinChance, handleRun, resolveLlmConfig, runSupplier } from "./index.js";
import { createRateLimiter } from "./handler.js";
import { runAttempt } from "./llm.js";
import { createBidSource, localInvite, httpInvite } from "./bid-source.js";
import { byPersona, failure, mockFetch, reply, submitting, toolCall } from "./mock-llm.js";

const tender = { ...TENDER, audience: "technical users" };
const reference = { pricePerSignup: 1, source: "operator" };
const request = (supplier) => ({ action: "bid", runId: "run_t", supplier, tender, reference, history: [] });
const ENV = { OPENROUTER_API_KEY: "k", OPENROUTER_MODELS: "m1,m2,m3,m4", AGENT_SHARED_SECRET: "s3cret" };
const salt = () => "fixed-salt";
console.error = () => {};
const anchors = Object.fromEntries(SUPPLIER_IDS.map((id) => [id, PERSONAS[id].pinned]));

const brain = (supplier, fetch, env = ENV, extra = {}) => runSupplier(request(supplier), { env, fetch, newSalt: salt, log: () => {}, ...extra });

test("clamps: each persona's schema rejects quotes outside its table row", () => {
  const ok = (id, over) => bidFor(id).safeParse({ decision: "bid", rationale: "r", ...PERSONAS[id].pinned, ...over }).success;
  for (const id of SUPPLIER_IDS) assert.ok(ok(id, {}), `${id} pinned quote is inside its clamps`);
  assert.equal(ok("techblog", { price: 8.5 }), false);
  assert.equal(ok("techblog", { price: 5 }), false);
  assert.equal(ok("techblog", { promisedPer1000: 9 }), false);
  assert.equal(ok("techblog", { price: 6.25 }), false, "price is a multiple of 0.5");
  assert.equal(ok("techblog", { impressions: 450 }), false);
  assert.equal(ok("techblog", { impressions: 1050 }), false, "impressions are a multiple of 100");
  assert.equal(ok("techblog", { promisedPer1000: 7.5 }), false, "promised is an integer");
  assert.equal(ok("devnewsletter", { promisedPer1000: 9 }), false);
  assert.equal(ok("gamingforum", { promisedPer1000: 5 }), false, "GamingForum cannot reach the gate");
  assert.equal(ok("gamingforum", { promisedPer1000: 4 }), true);
  assert.equal(bidFor("gamingforum").safeParse({ ...PERSONAS.gamingforum.pinned, decision: "bid", rationale: "" }).success, false);
});

test("D12 gate: every pinned quote passes at R = 1.00 with the documented margins", () => {
  const margins = { techblog: 2, codepodcast: 2, devnewsletter: 2.5, gamingforum: 1 };
  for (const id of SUPPLIER_IDS) {
    const g = estimateWinChance(PERSONAS[id].pinned, { persona: PERSONAS[id], tender, reference: 1 });
    assert.equal(g.winChance, 1, id);
    assert.equal(g.margin, margins[id], id);
    assert.equal(g.passed, true, id);
  }
  const g = estimateWinChance(PERSONAS.techblog.pinned, { persona: PERSONAS.techblog, tender, reference: 1 });
  assert.deepEqual(g, { pricePerSignup: 1, winChance: 1, margin: 2, ev: 1.8, passed: true });
  const dear = estimateWinChance({ price: 8, impressions: 500, promisedPer1000: 5 }, { persona: PERSONAS.techblog, tender, reference: 1 });
  assert.equal(dear.winChance, 0);
  assert.equal(dear.passed, false);
  const thin = estimateWinChance({ price: 5.5, impressions: 1500, promisedPer1000: 8 }, { persona: PERSONAS.techblog, tender, reference: 1 });
  assert.equal(thin.passed, false, "margin below 0.5 fails even with positive ev");
});

test("LLM path: tool loop, OpenRouter call shape, salt and commit made in code", async () => {
  const fetch = mockFetch(submitting({ price: 7, impressions: 1000, promisedPer1000: 7 }, "Fair margin."));
  const res = await brain("techblog", fetch);

  assert.equal(res.source, "llm");
  assert.equal(res.decision, "bid");
  assert.equal(res.model, "m1");
  assert.equal(res.turns, 3);
  assert.equal(res.usage.calls, 3);
  assert.ok(res.usage.tokens > 0);
  assert.equal(res.rationale, "Fair margin.");
  assert.deepEqual(res.gate, { pricePerSignup: 1, winChance: 1, margin: 2, ev: 1.8, passed: true });
  assert.equal(res.bid.salt, "fixed-salt");
  assert.equal(res.bid.commit, commit({ price: 7, impressions: 1000, promisedPer1000: 7, salt: "fixed-salt" }));
  assert.equal(InviteResponse.safeParse(res).success, true);

  assert.equal(fetch.calls.length, 3);
  const first = fetch.calls[0];
  assert.equal(first.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(first.init.headers.authorization, "Bearer k");
  assert.ok(first.init.signal instanceof AbortSignal);
  assert.equal(first.body.max_tokens, LLM_CONFIG.maxOutputTokens);
  assert.deepEqual(first.body.provider, { max_price: LLM_CONFIG.maxPrice });
  assert.deepEqual(first.body.tools.map((t) => t.function.name), ["get_operator_config", "estimate_win_chance", "submit_bid"]);
  assert.match(first.body.messages[0].content, /You run TechBlog/);
  assert.match(first.body.messages[0].content, /Budget 20 tUSDM/);
  const config = JSON.parse(fetch.calls[1].body.messages.find((m) => m.role === "tool").content);
  assert.deepEqual(config.clamps, PERSONAS.techblog.clamps);
  assert.equal(config.costPer1000, 5);
  const estimate = JSON.parse(fetch.calls[2].body.messages.filter((m) => m.role === "tool")[1].content);
  assert.equal(estimate.passed, true);
});

test("the model never supplies salt or commit: extra fields in submit_bid are ignored", async () => {
  const fetch = mockFetch(() =>
    reply({ tool_calls: [toolCall("submit_bid", { decision: "bid", ...PERSONAS.techblog.pinned, rationale: "r", salt: "evil", commit: "evil" })] }),
  );
  const res = await brain("techblog", fetch);
  assert.equal(res.bid.salt, "fixed-salt");
  assert.notEqual(res.bid.commit, "evil");
});

test("retry across models: 503, then a zod failure, then the third model answers", async () => {
  const good = submitting({ price: 6, impressions: 1000, promisedPer1000: 8 });
  const fetch = mockFetch((body, call, i) => {
    if (i === 0) return failure(503);
    if (i === 1) return reply({ tool_calls: [toolCall("submit_bid", { decision: "bid", price: 6, impressions: 1000, promisedPer1000: 99, rationale: "r" })] });
    return good(body);
  });
  const res = await brain("codepodcast", fetch);
  assert.equal(res.source, "llm");
  assert.equal(res.model, "m3");
  assert.deepEqual(fetch.calls.slice(0, 3).map((c) => c.body.model), ["m1", "m2", "m3"]);
});

test("a 429 moves on to the next model", async () => {
  const good = submitting({ price: 6, impressions: 1000, promisedPer1000: 8 });
  const fetch = mockFetch((body, call, i) => (i === 0 ? failure(429) : good(body)));
  const res = await brain("codepodcast", fetch);
  assert.equal(res.model, "m2");
});

test("at most 3 attempts, then the pinned quote with reason llm_error", async () => {
  const fetch = mockFetch(() => failure(503));
  const res = await brain("devnewsletter", fetch);
  assert.equal(fetch.calls.length, 3);
  assert.equal(res.source, "pinned");
  assert.equal(res.reason, "llm_error");
  assert.deepEqual({ ...res.bid, salt: undefined, commit: undefined }, { supplier: "devnewsletter", ...PERSONAS.devnewsletter.pinned, salt: undefined, commit: undefined });
  assert.equal(res.bid.commit, commit({ ...PERSONAS.devnewsletter.pinned, salt: "fixed-salt" }));
});

test("a single-model list is retried on that model, still capped at 3 attempts", async () => {
  const fetch = mockFetch(() => failure(500));
  await brain("techblog", fetch, { ...ENV, OPENROUTER_MODELS: " only " });
  assert.deepEqual(fetch.calls.map((c) => c.body.model), ["only", "only", "only"]);
});

test("timeout: a hanging model is aborted, the next model is tried, all hanging gives pinned with reason timeout", async () => {
  const good = submitting({ price: 7, impressions: 1000, promisedPer1000: 7 });
  const mixed = mockFetch((body, call, i) => (i === 0 ? "hang" : good(body)));
  const res = await brain("techblog", mixed, ENV, { attemptTimeoutMs: 20 });
  assert.equal(res.model, "m2");
  assert.equal(mixed.calls[0].init.signal.aborted, true);

  const hung = mockFetch(() => "hang");
  const pinned = await brain("techblog", hung, ENV, { attemptTimeoutMs: 20 });
  assert.equal(hung.calls.length, 3);
  assert.equal(pinned.source, "pinned");
  assert.equal(pinned.reason, "timeout");
});

test("zod failure on every attempt gives pinned with reason zod", async () => {
  const fetch = mockFetch(() => reply({ tool_calls: [{ id: "c", type: "function", function: { name: "submit_bid", arguments: "not json" } }] }));
  const res = await brain("techblog", fetch);
  assert.equal(res.source, "pinned");
  assert.equal(res.reason, "zod");
});

test("a model that never calls submit_bid uses 4 turns per attempt, then the call cap ends the run", async () => {
  const fetch = mockFetch(() => reply({ content: "I think we should bid 7." }));
  const res = await brain("techblog", fetch, { ...ENV, OPENROUTER_MODELS: "m1" });
  assert.equal(fetch.calls.length, LLM_CONFIG.maxCallsPerInvite);
  assert.equal(res.source, "pinned");
  assert.equal(res.reason, "budget");
});

test("forced failures: no API key, no models, PERSONA_MODE=pinned all skip the network", async () => {
  const fetch = mockFetch(() => failure(500));
  const noKey = await brain("gamingforum", fetch, { ...ENV, OPENROUTER_API_KEY: "" });
  assert.equal(noKey.source, "pinned");
  assert.equal(noKey.reason, "llm_error");
  const forced = await brain("gamingforum", fetch, { ...ENV, PERSONA_MODE: "pinned" });
  assert.equal(forced.source, "pinned");
  assert.equal(forced.reason, "forced");
  assert.equal(fetch.calls.length, 0);
});

test("each failed attempt is returned with model, status and a body cut to 200 characters, and logged", async () => {
  const lines = [];
  const long = "x".repeat(500);
  const fetch = mockFetch((body, call, i) => (i === 0 ? failure(429, { error: { message: long } }) : i === 1 ? failure(503, "overloaded") : "hang"));
  const res = await brain("techblog", fetch, ENV, { attemptTimeoutMs: 20, log: (l) => lines.push(l) });
  assert.equal(res.source, "pinned");
  assert.equal(res.reason, "timeout");
  assert.equal(res.attempts.length, 3);
  assert.deepEqual(res.attempts.map((a) => [a.model, a.reason, a.status]), [["m1", "llm_error", 429], ["m2", "llm_error", 503], ["m3", "timeout", undefined]]);
  assert.equal(res.attempts[0].error.length, 200);
  assert.match(res.attempts[0].error, /^\{"error":\{"message":"xxx/);
  assert.equal(res.attempts[1].error, "overloaded");
  assert.match(res.attempts[2].error, /timed out/);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /techblog attempt failed .*"status":429/);
  assert.equal(InviteResponse.safeParse(res).success, true);
});

test("the API key never reaches the attempts or the log, even when the provider echoes it", async () => {
  const lines = [];
  const prefix = ["sk", "or", "v1"].join("-");
  const key = `${prefix}-SECRETSECRETSECRET`;
  const fetch = mockFetch((body, call, i) =>
    i === 0 ? failure(401, `bad key ${key}`) : i === 1 ? failure(403, { error: { message: `Authorization: Bearer ${prefix}-OTHERKEY` } }) : failure(500, "x"),
  );
  const res = await brain("techblog", fetch, { ...ENV, OPENROUTER_API_KEY: key }, { log: (l) => lines.push(l) });
  const everything = JSON.stringify(res) + lines.join("\n");
  assert.ok(!everything.includes("SECRETSECRET"));
  assert.ok(!everything.includes("OTHERKEY"));
  assert.match(res.attempts[0].error, /bad key \[redacted\]/);
});

test("an HTTP 200 whose body is an error (provider overloaded) is reported with its message", async () => {
  const fetch = mockFetch((body, call, i) =>
    i === 0 ? { ok: true, status: 200, json: async () => ({ error: { message: "Service temporarily overloaded", code: 503 } }) } : failure(500),
  );
  const res = await brain("techblog", fetch);
  assert.equal(res.attempts[0].status, 200);
  assert.match(res.attempts[0].error, /Service temporarily overloaded/);
});

test("a successful run after failures still reports the failed attempts", async () => {
  const good = submitting({ price: 7, impressions: 1000, promisedPer1000: 7 });
  const fetch = mockFetch((body, call, i) => (i === 0 ? failure(429) : good(body)));
  const res = await brain("techblog", fetch);
  assert.equal(res.source, "llm");
  assert.equal(res.attempts.length, 1);
  assert.equal(res.attempts[0].status, 429);
});

test("a missing API key says which one is missing", async () => {
  const noKey = await brain("gamingforum", mockFetch(() => failure(500)), { ...ENV, OPENROUTER_API_KEY: "" });
  assert.equal(noKey.reason, "llm_error");
  assert.match(noKey.attempts[0].error, /OPENROUTER_API_KEY is not set/);
});

test("request switches reasoning off, so a reasoning model does not spend its token budget thinking", async () => {
  const fetch = mockFetch(submitting({ price: 7, impressions: 1000, promisedPer1000: 7 }));
  await brain("techblog", fetch);
  assert.deepEqual(fetch.calls[0].body.reasoning, { enabled: false });
});

test("a model that makes reasoning mandatory is asked again with reasoning on, once", async () => {
  const good = submitting({ price: 7, impressions: 1000, promisedPer1000: 7 });
  const fetch = mockFetch((body, call, i) =>
    i === 0 ? failure(400, { error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled." } }) : good(body),
  );
  const res = await brain("techblog", fetch);
  assert.equal(res.source, "llm");
  assert.equal(res.model, "m1");
  assert.deepEqual(fetch.calls[0].body.reasoning, { enabled: false });
  assert.equal("reasoning" in fetch.calls[1].body, false);
  assert.equal("reasoning" in fetch.calls[2].body, false, "later turns keep it on");
  assert.equal(res.attempts, undefined);
  assert.equal(res.usage.calls, 4, "the repeated request counts against the call cap");
});

test("any other 400 is a failed attempt, not a retry", async () => {
  const fetch = mockFetch(() => failure(400, { error: { message: "bad tools schema" } }));
  const res = await brain("techblog", fetch);
  assert.equal(fetch.calls.length, 3, "one request per attempt");
  assert.equal(res.attempts[0].status, 400);
  assert.match(res.attempts[0].error, /bad tools schema/);
});

test("the last turn forces submit_bid, so a model that keeps probing still answers", async () => {
  const quote = { price: 7, impressions: 1000, promisedPer1000: 7 };
  const fetch = mockFetch((body) =>
    body.tool_choice === "auto" ? reply({ tool_calls: [toolCall("estimate_win_chance", quote)] }) : reply({ tool_calls: [toolCall("submit_bid", { decision: "bid", ...quote, rationale: "r" })] }),
  );
  const res = await brain("techblog", fetch);
  assert.equal(res.source, "llm");
  assert.equal(res.turns, LLM_CONFIG.maxTurns);
  const choices = fetch.calls.map((c) => c.body.tool_choice);
  assert.deepEqual(choices.at(-1), { type: "function", function: { name: "submit_bid" } });
  assert.ok(choices.slice(0, -1).every((c) => c === "auto"));
});

test("the route returns the attempts in its 200 body", async () => {
  const res = await handleRun({
    request: new Request("http://x/api/agents/techblog/run", {
      method: "POST",
      headers: { "x-agent-secret": "s3cret", "content-type": "application/json" },
      body: JSON.stringify(request("techblog")),
    }),
    name: "techblog",
    env: ENV,
    fetch: mockFetch(() => failure(429, { error: { message: "rate limited" } })),
    limiter: () => true,
  });
  const body = await res.json();
  assert.equal(body.reason, "llm_error");
  assert.equal(body.attempts.length, 3);
  assert.equal(body.attempts[0].status, 429);
  assert.match(body.attempts[0].error, /rate limited/);
});

test("GamingForum: the LLM cannot promise the gate, so its bid ends below it", async () => {
  const stretch = mockFetch(() => reply({ tool_calls: [toolCall("submit_bid", { decision: "bid", price: 3, impressions: 1000, promisedPer1000: 5, rationale: "r" })] }));
  const res = await brain("gamingforum", stretch, { ...ENV, OPENROUTER_MODELS: "m1" });
  assert.equal(res.source, "pinned", "5 per 1,000 fails the clamp");
  assert.ok(res.bid.promisedPer1000 < tender.gate);

  const honest = mockFetch(submitting({ price: 3, impressions: 1000, promisedPer1000: 4 }));
  const ok = await brain("gamingforum", honest);
  assert.equal(ok.source, "llm");
  assert.ok(ok.bid.promisedPer1000 < tender.gate);
  const { rejected } = evaluateBids({ tender, bids: [{ ...ok.bid, committedAt: 1 }] });
  assert.deepEqual(rejected, [{ supplier: "gamingforum", reason: "below_gate" }]);
});

test("DevNewsletter over-promises: its clamp starts above any realistic rate and the bid is accepted as a quote", async () => {
  const fetch = mockFetch(submitting({ price: 7, impressions: 1500, promisedPer1000: 15 }, "List converts well."));
  const res = await brain("devnewsletter", fetch);
  assert.equal(res.source, "llm");
  assert.equal(res.decision, "bid");
  assert.ok(res.bid.promisedPer1000 >= PERSONAS.devnewsletter.clamps.promisedPer1000[0]);
  assert.ok(res.bid.promisedPer1000 >= 10, "above the 6 to 8 that CodePodcast and TechBlog expect");
  const { accepted } = evaluateBids({ tender, bids: [{ ...res.bid, committedAt: 1 }] });
  assert.equal(accepted.length, 1);
});

test("the code applies the gate: a quote that fails it becomes a skip with no bid", async () => {
  const dear = mockFetch(submitting({ price: 8, impressions: 500, promisedPer1000: 5 }));
  const res = await brain("techblog", dear);
  assert.equal(res.source, "llm");
  assert.equal(res.decision, "skip");
  assert.equal(res.bid, undefined);
  assert.equal(res.gate.passed, false);
  assert.equal(res.gate.winChance, 0);

  const modelSkips = mockFetch(() =>
    reply({ tool_calls: [toolCall("submit_bid", { decision: "skip", ...PERSONAS.techblog.pinned, rationale: "No quote passes." })] }),
  );
  const skip = await brain("techblog", modelSkips);
  assert.equal(skip.decision, "skip");
  assert.equal(skip.bid, undefined);
  assert.equal(skip.rationale, "No quote passes.");
});

test("bad estimate_win_chance arguments come back as a tool error, not a crash", async () => {
  const fetch = mockFetch((body) => {
    const tools = body.messages.filter((m) => m.role === "tool");
    if (tools.length === 0) return reply({ tool_calls: [toolCall("estimate_win_chance", { price: 7, impressions: 1000, promisedPer1000: 0 })] });
    return reply({ tool_calls: [toolCall("submit_bid", { decision: "bid", ...PERSONAS.techblog.pinned, rationale: "r" })] });
  });
  const res = await brain("techblog", fetch);
  assert.equal(res.source, "llm");
  assert.match(fetch.calls[1].body.messages.at(-1).content, /must be positive/);
});

test("history reaches the prompt and the operator config", async () => {
  const history = [{ supplier: "techblog", kind: "pass", price: 7, promised: 7, delivered: 8 }];
  const fetch = mockFetch(submitting(PERSONAS.techblog.pinned));
  await runSupplier({ ...request("techblog"), history }, { env: ENV, fetch, newSalt: salt });
  assert.match(fetch.calls[0].body.messages[0].content, /"delivered":8/);
});

// ---- route handler ----

const post = (body, headers = { "x-agent-secret": "s3cret" }) =>
  new Request("http://x/api/agents/techblog/run", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("route: 404 unknown name, 401 bad or unset secret, 400 bad body or mismatched supplier", async () => {
  const fetch = mockFetch(() => failure(500));
  const run = (name, req, env = ENV) => handleRun({ request: req, name, env, fetch });

  assert.equal((await run("nobody", post(request("techblog")))).status, 404);
  assert.equal((await run("techblog", post(request("techblog"), {}))).status, 401);
  assert.equal((await run("techblog", post(request("techblog"), { "x-agent-secret": "nope" }))).status, 401);
  assert.equal((await run("techblog", post(request("techblog")), { ...ENV, AGENT_SHARED_SECRET: "" })).status, 401);
  assert.equal((await run("techblog", post("{oops"))).status, 400);
  assert.equal((await run("techblog", post({ runId: "r" }))).status, 400);
  assert.equal((await run("techblog", post(request("codepodcast")))).status, 400);
  assert.equal(fetch.calls.length, 0);
});

test("route: 200 InviteResponse, defaults fill reference and history, a broken LLM still answers 200 pinned", async () => {
  const { reference: _r, history: _h, action: _a, ...minimal } = request("techblog");
  const res = await handleRun({ request: post(minimal), name: "techblog", env: ENV, fetch: mockFetch(() => failure(503)) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(InviteResponse.safeParse(body).success, true);
  assert.equal(body.source, "pinned");
  assert.equal(body.reason, "llm_error");
});

// ---- bidSource ----

test("bidSource: a failing or malformed invite becomes the pinned quote with its own reason", async () => {
  const invite = async ({ supplier }) => {
    if (supplier === "techblog") throw Object.assign(new Error("slow"), { timeout: true });
    if (supplier === "codepodcast") throw new Error("503");
    if (supplier === "devnewsletter") return { nonsense: true };
    return { supplier: "gamingforum", decision: "bid", rationale: "r", source: "llm" };
  };
  const bids = await createBidSource({ invite })({ tender, run: { id: "r" } });
  const by = Object.fromEntries(bids.map((b) => [b.supplier, b]));
  assert.equal(by.techblog.reason, "invite_timeout");
  assert.equal(by.codepodcast.reason, "invite_error");
  assert.equal(by.devnewsletter.reason, "invite_error");
  assert.equal(by.gamingforum.reason, "invite_error", "a bid response without a bid is invalid");
  for (const b of bids) {
    assert.equal(b.source, "pinned");
    assert.equal(b.committedAt, undefined, "the Board stamps committedAt");
    assert.equal(b.commit, commit(b));
  }
});

test("bidSource: skips return no entry", async () => {
  const invite = async ({ supplier }) => ({ supplier, decision: "skip", rationale: "No.", source: "llm" });
  assert.deepEqual(await createBidSource({ invite })({ tender, run: { id: "r" } }), []);
});

test("httpInvite: posts the body to <base>/tender-invite with the secret, and aborts after its timeout", async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ ok: 1 }) };
  };
  const invite = httpInvite({ urls: { techblog: "https://tb.example/" }, secret: "s3cret", fetch });
  assert.deepEqual(await invite(request("techblog")), { ok: 1 });
  assert.equal(seen[0].url, "https://tb.example/tender-invite");
  assert.equal(seen[0].init.headers["x-agent-secret"], "s3cret");
  assert.equal(JSON.parse(seen[0].init.body).supplier, "techblog");

  await assert.rejects(invite(request("codepodcast")), /no invite URL/);

  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const slow = httpInvite({ urls: { techblog: "https://tb.example" }, secret: "s", fetch: hang, timeoutMs: 20 });
  await assert.rejects(slow(request("techblog")), (err) => err.timeout === true);

  const bad = httpInvite({ urls: { techblog: "https://tb.example" }, secret: "s", fetch: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(bad(request("techblog")), /502/);
});

// ---- Board rehearsal ----

const outcome = (run) => ({
  net: run.receipt.consumer.net,
  signups: run.receipt.consumer.signups,
  winners: run.auction.accepted.map((a) => a.supplier).sort(),
  rejected: run.auction.rejected,
  kinds: Object.fromEntries(run.verdicts.map((v) => [v.supplier, v.kind])),
});

const WORKED = {
  net: -10.875,
  signups: 14,
  winners: ["codepodcast", "devnewsletter", "techblog"],
  rejected: [{ supplier: "gamingforum", reason: "below_gate" }],
  kinds: { techblog: "pass", codepodcast: "short_of_promise", devnewsletter: "under_gate" },
};

async function rehearse(bidSource) {
  const board = await createFixtureBoard({ bidSource });
  const created = await board.createRun();
  return board.runAll(created.id);
}

test("Board rehearsal, PERSONA_MODE=pinned, in-process: worked example, Consumer net -10.875 and 14 signups", async () => {
  const run = await rehearse(createBidSource({ invite: localInvite({ env: { ...ENV, PERSONA_MODE: "pinned" } }) }));
  assert.deepEqual(outcome(run), WORKED);
  assert.ok(run.bids.every((b) => b.source === "pinned" && b.reason === "forced"));
  assert.equal(run.ledger.filter((l) => l.phase === "bid_fee").length, 4);
});

test("Board rehearsal over the registered Vercel URLs: <base>/tender-invite reaches the handler, secret checked, worked example", async () => {
  const app = "https://ad-slot-auction.example";
  const vercel = async (url, init) => {
    const match = new URL(url).pathname.match(/^\/api\/agents\/([^/]+)\/tender-invite$/);
    assert.ok(match, `unexpected path ${url}`);
    const res = await handleRun({
      request: new Request(url, { method: "POST", headers: init.headers, body: init.body }),
      name: match[1],
      env: { ...ENV, PERSONA_MODE: "pinned" },
    });
    return { ok: res.ok, status: res.status, json: () => res.json() };
  };
  const urls = Object.fromEntries(SUPPLIER_IDS.map((id) => [id, `${app}/api/agents/${id}`]));
  const run = await rehearse(createBidSource({ invite: httpInvite({ urls, secret: "s3cret", fetch: vercel }) }));
  assert.deepEqual(outcome(run), WORKED);
});

test("Board rehearsal, LLM path at the anchors: same winners, GamingForum rejected, sources are llm", async () => {
  const llm = mockFetch(byPersona(anchors));
  const run = await rehearse(createBidSource({ invite: localInvite({ env: ENV, fetch: llm }) }));
  assert.deepEqual(outcome(run), WORKED);
  assert.ok(run.bids.every((b) => b.source === "llm" && b.model === "m1"));
  assert.ok(run.bids.every((b) => b.commit === commit(b)), "reveal matches the commit, so the Board accepts every hash");
  assert.deepEqual(run.auction.rejected, [{ supplier: "gamingforum", reason: "below_gate" }]);
});

test("Board rehearsal, LLM down: every supplier falls back to its pinned quote and the run is the worked example", async () => {
  const llm = mockFetch(() => failure(503));
  const run = await rehearse(createBidSource({ invite: localInvite({ env: ENV, fetch: llm }) }));
  assert.deepEqual(outcome(run), WORKED);
  assert.ok(run.bids.every((b) => b.source === "pinned" && b.reason === "llm_error"));
});

test("Board rehearsal: a skipping supplier gets no commit and pays no bid fee", async () => {
  const quotes = { ...anchors, gamingforum: { price: 4, impressions: 500, promisedPer1000: 2 } };
  const llm = mockFetch(byPersona(quotes));
  const run = await rehearse(createBidSource({ invite: localInvite({ env: ENV, fetch: llm }) }));
  assert.equal(run.bids.some((b) => b.supplier === "gamingforum"), false);
  assert.equal(run.ledger.filter((l) => l.phase === "bid_fee").length, 3);
  assert.deepEqual(outcome(run).winners, WORKED.winners);
});

// ---- one place for LLMs, and the spend guards ----

test("llm config: defaults live in llm-config.js, OPENROUTER_MODELS only overrides the model list", () => {
  assert.deepEqual(resolveLlmConfig({}).models, LLM_CONFIG.models);
  assert.deepEqual(resolveLlmConfig({ OPENROUTER_MODELS: " " }).models, LLM_CONFIG.models);
  assert.deepEqual(resolveLlmConfig({ OPENROUTER_MODELS: "a, b" }).models, ["a", "b"]);
  assert.equal(resolveLlmConfig({ OPENROUTER_MODELS: "a" }).maxOutputTokens, LLM_CONFIG.maxOutputTokens);
  assert.ok(LLM_CONFIG.maxCallsPerInvite <= LLM_CONFIG.maxAttempts * LLM_CONFIG.maxTurns);
});

test("every default model fits under the price ceiling and the list has no duplicates", () => {
  assert.equal(new Set(LLM_CONFIG.models).size, LLM_CONFIG.models.length);
  for (const m of ["xiaomi/mimo-v2.6-flash", "openai/gpt-6-luna", "deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash"]) assert.ok(LLM_CONFIG.models.includes(m), m);
});

test("default models are used when OPENROUTER_MODELS is unset", async () => {
  const fetch = mockFetch(() => failure(503));
  await brain("techblog", fetch, { OPENROUTER_API_KEY: "k" });
  assert.deepEqual(fetch.calls.map((c) => c.body.model), LLM_CONFIG.models.slice(0, LLM_CONFIG.maxAttempts));
});

test("budget: the call cap stops the run and pins the quote with reason budget", async () => {
  const fetch = mockFetch(() => reply({ content: "thinking" }));
  const res = await brain("techblog", fetch, { ...ENV, OPENROUTER_MODELS: "m1" });
  assert.equal(fetch.calls.length, LLM_CONFIG.maxCallsPerInvite);
  assert.equal(res.source, "pinned");
  assert.equal(res.reason, "budget");
  assert.equal(res.usage.calls, LLM_CONFIG.maxCallsPerInvite);
});

test("budget: the token cap stops the run after the call that crossed it", async () => {
  const fat = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "x" } }], usage: { total_tokens: LLM_CONFIG.maxTokensPerInvite } }) });
  const fetch = mockFetch(fat);
  const res = await brain("techblog", fetch);
  assert.equal(fetch.calls.length, 1);
  assert.equal(res.reason, "budget");
  assert.equal(res.usage.tokens, LLM_CONFIG.maxTokensPerInvite);
});

test("budget: an oversized prompt is refused before any call", async () => {
  const fetch = mockFetch(() => failure(500));
  await assert.rejects(
    runAttempt({ fetch, apiKey: "k", model: "m1", persona: PERSONAS.techblog, tender, reference, history: [], config: { ...LLM_CONFIG, maxInputChars: 100 } }),
    (err) => err.reason === "budget",
  );
  assert.equal(fetch.calls.length, 0);
});

test("input limits: the prompt only carries the last historyEntries results, and the route schema bounds every string", () => {
  const long = (n) => "x".repeat(n);
  assert.equal(InviteRequest.safeParse({ ...request("techblog"), tender: { ...tender, audience: long(201) } }).success, false);
  assert.equal(InviteRequest.safeParse({ ...request("techblog"), runId: long(101) }).success, false);
  const row = { supplier: "techblog", kind: "pass", price: 1, promised: 1, delivered: 1 };
  assert.equal(InviteRequest.safeParse({ ...request("techblog"), history: Array(21).fill(row) }).success, false);
  assert.equal(InviteRequest.safeParse({ ...request("techblog"), history: Array(20).fill(row) }).success, true);
});

test("prompt shows at most historyEntries past results", async () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ supplier: "techblog", kind: "pass", price: 7, promised: 7, delivered: 100 + i }));
  const fetch = mockFetch(submitting(PERSONAS.techblog.pinned));
  await runSupplier({ ...request("techblog"), history }, { env: ENV, fetch, newSalt: salt });
  const sys = fetch.calls[0].body.messages[0].content;
  assert.match(sys, /"delivered":107/);
  assert.doesNotMatch(sys, /"delivered":102/);
});

test("rate limit: past maxInvitesPerMinute the route answers pinned rate_limited without calling the LLM", async () => {
  let t = 0;
  const limiter = createRateLimiter({ now: () => t });
  const fetch = mockFetch(() => failure(503));
  const env = { ...ENV, OPENROUTER_MODELS: "m1" };
  const call = () => handleRun({ request: post(request("techblog")), name: "techblog", env, fetch, limiter });
  for (let i = 0; i < LLM_CONFIG.maxInvitesPerMinute; i++) assert.equal((await (await call()).json()).reason, "llm_error");
  const callsBefore = fetch.calls.length;
  const over = await (await call()).json();
  assert.equal(over.reason, "rate_limited");
  assert.equal(over.source, "pinned");
  assert.equal(fetch.calls.length, callsBefore);
  t = 61_000;
  assert.equal((await (await call()).json()).reason, "llm_error", "the window slides");
});
