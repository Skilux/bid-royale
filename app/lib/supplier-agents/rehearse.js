// Scripted rehearsal: one full Board run with the supplier agents as bidSource.
// Run from app/: node lib/supplier-agents/rehearse.js
// Uses OPENROUTER_API_KEY when set (live LLM, models from llm-config.js), else the pinned quotes.
// PERSONA_MODE=pinned forces pinned quotes. Payments are the SIMULATED adapter.
import { createFixtureBoard } from "../board/worked-example.js";
import { createBidSource, localInvite } from "./bid-source.js";
import { resolveLlmConfig } from "./llm-config.js";

const env = { ...process.env };
const referencePrice = Number(env.REFERENCE_PRICE) > 0 ? Number(env.REFERENCE_PRICE) : 1;
const { models } = resolveLlmConfig(env);
console.log(`models: ${models.join(", ")}`);
const board = await createFixtureBoard({ bidSource: createBidSource({ invite: localInvite({ env }), referencePrice }) });
const created = await board.createRun();
const run = await board.runAll(created.id);

const path = env.PERSONA_MODE === "pinned" ? "pinned (forced)" : env.OPENROUTER_API_KEY ? "live LLM with pinned fallback" : "pinned (no OPENROUTER_API_KEY)";
console.log(`path: ${path}`);
for (const b of run.bids) {
  const g = b.gate;
  console.log(
    `${b.supplier.padEnd(14)} ${b.source.padEnd(6)} ${b.reason ?? b.model ?? ""}`.trimEnd(),
    `price ${b.price} impressions ${b.impressions} promised ${b.promisedPer1000}`,
    `gate pps ${g.pricePerSignup} win ${g.winChance} margin ${g.margin} ev ${g.ev}`,
    b.usage ? `usage ${b.usage.calls} calls ${b.usage.tokens} tokens` : "",
  );
}
for (const b of run.bids) for (const a of b.attempts ?? []) console.log(`  attempt failed ${b.supplier}: ${a.model} ${a.reason} ${a.status ?? ""} ${a.error}`.replace(/ {2,}/g, " "));
const skipped = run.suppliers.map((s) => s.id).filter((id) => !run.bids.some((b) => b.supplier === id));
if (skipped.length) console.log(`skipped (no bid, no fee): ${skipped.join(", ")}`);
console.log("winners:", run.auction.accepted.map((a) => a.supplier).join(", "));
console.log("rejected:", JSON.stringify(run.auction.rejected));
console.log("verdicts:", run.verdicts.map((v) => `${v.supplier}=${v.kind}`).join(", "));
console.log(`consumer net ${run.receipt.consumer.net}, signups ${run.receipt.consumer.signups}`);
