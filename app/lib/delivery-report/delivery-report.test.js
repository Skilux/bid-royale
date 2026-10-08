import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../signing/index.js";
import { canonicalJson } from "../signing/canonical.js";
import { createFixtureBoard } from "../board/worked-example.js";
import { verifyItem } from "../evidence/verify.js";
import { handleDelivery } from "./handler.js";
import { RESULT_HASH_RECIPE, parseReport, resultHash, scriptedReport, sealReport } from "./index.js";

const ENV = { AGENT_SHARED_SECRET: "s3cret" };
const good = (over = {}) => ({
  supplier: "techblog",
  runId: "run_worked-example",
  window: { from: "2026-10-08T22:00:00.000Z", to: "2026-10-08T23:00:00.000Z" },
  impressionsServed: 1000,
  sessionIds: ["techblog.0002", "techblog.0001"],
  servedAt: "2026-10-08T23:00:00.000Z",
  ...over,
});

const post = (board, name, body, secret = "s3cret") =>
  handleDelivery({
    request: new Request("http://x.test/delivery", {
      method: "POST",
      headers: { "x-agent-secret": secret, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    name,
    env: ENV,
    board: () => board,
  });

async function boardAfter(step) {
  const board = await createFixtureBoard();
  const run = await board.createRun();
  for (const s of ["bids", "allocation", "locks", "feed", "verification", "verdicts"]) {
    if (s === step) break;
    await board.runStep(run.id, s);
  }
  return { board, run };
}

test("the report format accepts the agreed fields and rejects unknown ones", () => {
  assert.equal(parseReport(good()).ok, true);
  assert.equal(parseReport(good({ extra: 1 })).ok, false);
  assert.equal(parseReport(good({ impressionsServed: -1 })).ok, false);
  assert.equal(parseReport(good({ window: { from: "2026-10-08T23:00:00.000Z", to: "2026-10-08T22:00:00.000Z" } })).ok, false);
  assert.equal(parseReport(good({ servedAt: "yesterday" })).ok, false);
  const { supplier: _s, ...missing } = good();
  assert.deepEqual(parseReport(missing).issues, ["supplier: Invalid input: expected string, received undefined"]);
});

test("the hash recipe: reportHash is sha256 of the canonical bytes, resultHash adds the verdict hash", () => {
  const report = good();
  const sealed = sealReport(report);
  assert.equal(sealed.text, canonicalJson(report));
  assert.equal(sealed.hash, sha256Hex(canonicalJson(report)));
  const verdictHash = "ab".repeat(32);
  assert.equal(resultHash(sealed.text, verdictHash), sha256Hex(`${canonicalJson(report)}${verdictHash}`));
  assert.notEqual(resultHash(sealed.text, verdictHash), sealed.hash);
  assert.deepEqual(sealReport({ ...report, sessionIds: report.sessionIds }), sealed, "same input, same bytes");
  assert.throws(() => resultHash(sealed.text, "short"), /64-char/);
  assert.match(RESULT_HASH_RECIPE, /no separator/);
});

test("test vector: a fixed report gives a fixed result hash", () => {
  const report = {
    supplier: "techblog",
    runId: "run_x",
    window: { from: "2026-10-08T22:00:00.000Z", to: "2026-10-08T23:00:00.000Z" },
    impressionsServed: 1,
    sessionIds: ["a"],
    servedAt: "2026-10-08T23:00:00.000Z",
  };
  const text =
    '{"impressionsServed":1,"runId":"run_x","servedAt":"2026-10-08T23:00:00.000Z","sessionIds":["a"],"supplier":"techblog","window":{"from":"2026-10-08T22:00:00.000Z","to":"2026-10-08T23:00:00.000Z"}}';
  assert.equal(sealReport(report).text, text);
  // Both hashes below were computed with `shasum -a 256`, not with this code.
  assert.equal(sealReport(report).hash, "fc91803331e5ac48f4086d7b2011d9290eff9f0e7e99a2ab25cb05117cc9ca4a");
  assert.equal(resultHash(text, "00".repeat(32)), "c67617f828198d710a9914e11d9f8e22879022015a98ed3037452aac609f47a7");
});

test("a run stores one delivery report per winner, and its result hash is on the run", async () => {
  const board = await createFixtureBoard();
  const created = await board.createRun();
  const run = await board.runAll(created.id);

  assert.deepEqual(Object.keys(run.delivery).sort(), ["codepodcast", "devnewsletter", "techblog"]);
  for (const v of run.verdicts) {
    const delivery = await board.evidenceItem(run.id, `delivery.${v.supplier}`);
    const result = await board.evidenceItem(run.id, `result.${v.supplier}`);
    assert.equal(delivery.origin, "scripted_demo");
    assert.equal(run.delivery[v.supplier].reportHash, delivery.hash);
    assert.equal(run.delivery[v.supplier].resultHash, resultHash(delivery.bytes, v.hash));
    assert.equal(JSON.parse(result.bytes).resultHash, run.delivery[v.supplier].resultHash);
    assert.equal((await verifyItem(delivery)).ok, true);
    assert.equal((await verifyItem(result)).ok, true);
  }
  assert.equal(await board.evidenceItem(run.id, "delivery.gamingforum"), null, "a lost bid has no report");
});

test("Verify fails when the report bytes inside a result item are changed", async () => {
  const board = await createFixtureBoard();
  const run = await board.runAll((await board.createRun()).id);
  const result = await board.evidenceItem(run.id, "result.techblog");
  const parsed = JSON.parse(result.bytes);
  parsed.reportBytes = parsed.reportBytes.replace('"impressionsServed":1000', '"impressionsServed":9000');
  const text = JSON.stringify(parsed);
  const forged = { ...result, bytes: text, hash: sha256Hex(text), size: Buffer.byteLength(text) };
  const out = await verifyItem(forged);
  assert.equal(out.checks[0].ok, true);
  assert.equal(out.ok, false);
});

test("the verdict ignores the report: a huge claim does not change the verdict", async () => {
  const claims = [];
  for (const impressionsServed of [0, 9_000_000]) {
    const { board, run } = await boardAfter("verdicts");
    const status = await post(board, "devnewsletter", good({ supplier: "devnewsletter", runId: run.id, impressionsServed }));
    assert.equal(status.status, 200);
    await board.runStep(run.id, "verdicts");
    const after = await board.getRun(run.id);
    claims.push(after.verdicts.find((v) => v.supplier === "devnewsletter"));
  }
  assert.equal(claims[0].kind, "under_gate");
  assert.equal(claims[1].kind, "under_gate");
  assert.equal(claims[0].hash, claims[1].hash);
});

test("a supplier that posts before the verdicts step keeps its own report", async () => {
  const { board, run } = await boardAfter("verdicts");
  const res = await post(board, "techblog", good({ runId: run.id }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "created");
  assert.equal(body.reportHash, sealReport(good({ runId: run.id })).hash);

  await board.runStep(run.id, "verdicts");
  const done = await board.getRun(run.id);
  assert.equal(done.delivery.techblog.source, "supplier_post");
  assert.equal(done.delivery.codepodcast.source, "scripted_demo");
  assert.equal(done.delivery.techblog.reportHash, body.reportHash);
});

test("endpoint: auth, format, unknown run, non-winner, repeat and conflicting report", async () => {
  const { board, run } = await boardAfter("locks");
  const body = good({ runId: run.id });

  assert.equal((await post(board, "techblog", body, "wrong")).status, 401);
  assert.equal((await post(board, "nobody", body)).status, 404);
  assert.equal((await post(board, "techblog", "not json")).status, 400);
  assert.equal((await post(board, "techblog", { ...body, extra: true })).status, 400);
  assert.equal((await post(board, "codepodcast", body)).status, 400, "supplier in the body must match the route");
  assert.equal((await post(board, "techblog", { ...body, runId: "run_missing" })).status, 404);
  assert.equal((await post(board, "gamingforum", { ...body, supplier: "gamingforum" })).status, 409, "a lost bid has no award");

  const first = await post(board, "techblog", body);
  assert.equal(first.status, 200);
  const again = await post(board, "techblog", body);
  assert.equal((await again.json()).status, "same");
  const other = await post(board, "techblog", { ...body, impressionsServed: 5 });
  assert.equal(other.status, 409);
  assert.equal((await other.json()).error, "report_exists");
});

test("no secret is stored with a report, and the endpoint is closed without a configured secret", async () => {
  const { board, run } = await boardAfter("locks");
  await post(board, "techblog", good({ runId: run.id }));
  assert.ok(!(await board.evidenceItem(run.id, "delivery.techblog")).bytes.includes("s3cret"));
  const closed = await handleDelivery({
    request: new Request("http://x.test", { method: "POST", headers: { "x-agent-secret": "" }, body: "{}" }),
    name: "techblog",
    env: {},
    board: () => board,
  });
  assert.equal(closed.status, 401);
});

test("the scripted report comes from the feed: DevNewsletter claims impressions, the shop verifies none", async () => {
  const board = await createFixtureBoard();
  const run = await board.runAll((await board.createRun()).id);
  const report = scriptedReport(run, "devnewsletter");
  assert.equal(report.impressionsServed, 1500);
  assert.equal(parseReport(report).ok, true);
  assert.equal(run.verification.verified.devnewsletter ?? 0, 0);
});
