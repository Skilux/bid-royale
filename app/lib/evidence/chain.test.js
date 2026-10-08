import test from "node:test";
import assert from "node:assert/strict";
import { chainLink } from "./chain.js";

const TX = "a".repeat(64);
const row = (extra) => ({ phase: "settlement", supplier: "techblog", action: "award_release", ...extra });

test("a REAL award row with an https explorer link is shown as REAL", () => {
  const link = chainLink({ rows: [row({ badge: "REAL", txHash: TX, explorerUrl: `https://preprod.cardanoscan.io/transaction/${TX}` })] }, "techblog");
  assert.deepEqual(link, {
    hashItem: "verdict.techblog",
    fallback: true,
    badge: "REAL",
    txHash: TX,
    explorerUrl: `https://preprod.cardanoscan.io/transaction/${TX}`,
  });
});

test("PENDING is never shown as money moved, and simulated rows have no link", () => {
  assert.equal(chainLink({ rows: [row({ badge: "PENDING", txHash: null })] }, "techblog").badge, "PENDING");
  const sim = chainLink({ rows: [row({ badge: "SIMULATED", txHash: "sim_abc", explorerUrl: null })] }, "techblog");
  assert.equal(sim.badge, "SIMULATED");
  assert.equal(sim.explorerUrl, null);
  const fake = chainLink({ rows: [row({ badge: "REAL", txHash: "sim_abc", explorerUrl: "https://x.test/sim_abc" })] }, "techblog");
  assert.equal(fake.badge, "SIMULATED", "a sim_ hash is never REAL");
  assert.equal(chainLink(null, "techblog").badge, "SIMULATED");
});

test("with a delivery report the hash comes from the result item, not the verdict", () => {
  const link = chainLink({ rows: [] }, "codepodcast", { hasReport: true });
  assert.equal(link.hashItem, "result.codepodcast");
  assert.equal(link.fallback, false);
});

test("only the supplier's own award row counts", () => {
  const other = { ...row({ badge: "REAL", txHash: TX, explorerUrl: `https://preprod.cardanoscan.io/transaction/${TX}` }), supplier: "codepodcast" };
  assert.equal(chainLink({ rows: [other, row({ action: "bond_return", badge: "REAL", txHash: TX, explorerUrl: "https://x.test/y" })] }, "techblog").badge, "SIMULATED");
});
