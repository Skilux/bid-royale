import { randomBytes } from "node:crypto";
import { commit } from "../auction/index.js";
import { estimateWinChance } from "./gate.js";
import { MAX_ATTEMPTS, runAttempt } from "./llm.js";
import { PERSONAS } from "./personas.js";

const newSalt = () => randomBytes(16).toString("hex");

export const parseModels = (value) =>
  (value ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

function sealed(supplier, quote, salt) {
  return { supplier, ...quote, salt, commit: commit({ ...quote, salt }) };
}

/** The persona's pinned quote as an InviteResponse. Pinned quotes bypass the gate: they are the anchors. */
export function pinnedResponse({ supplier, tender, reference, reason, salt = newSalt() }) {
  const persona = PERSONAS[supplier];
  return {
    supplier,
    decision: "bid",
    bid: sealed(supplier, persona.pinned, salt),
    rationale: `Pinned quote (${reason}).`,
    gate: estimateWinChance(persona.pinned, { persona, tender, reference: reference.pricePerSignup }),
    source: "pinned",
    reason,
  };
}

/**
 * One supplier brain: LLM quote via OpenRouter, gate in code, salt and commit in code.
 * Any failure ends in the pinned quote, never in an exception.
 *
 * @param {object} request  a parsed InviteRequest
 * @param {{ env?: object, fetch?: typeof fetch, newSalt?: () => string, attemptTimeoutMs?: number }} [deps]
 */
export async function runSupplier(request, { env = process.env, fetch: fetchImpl = fetch, newSalt: salt = newSalt, attemptTimeoutMs } = {}) {
  const { supplier, tender, reference, history } = request;
  const persona = PERSONAS[supplier];
  const pinned = (reason) => pinnedResponse({ supplier, tender, reference, reason, salt: salt() });

  if (env.PERSONA_MODE === "pinned") return pinned("forced");

  const models = parseModels(env.OPENROUTER_MODELS);
  if (!env.OPENROUTER_API_KEY || models.length === 0) return pinned("llm_error");

  let reason = "llm_error";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = models[attempt % models.length];
    try {
      const { answer, turns } = await runAttempt({
        fetch: fetchImpl,
        apiKey: env.OPENROUTER_API_KEY,
        model,
        persona,
        tender,
        reference,
        history,
        timeoutMs: attemptTimeoutMs,
      });
      const quote = { price: answer.price, impressions: answer.impressions, promisedPer1000: answer.promisedPer1000 };
      const gate = estimateWinChance(quote, { persona, tender, reference: reference.pricePerSignup });
      const decision = answer.decision === "bid" && gate.passed ? "bid" : "skip";
      return {
        supplier,
        decision,
        ...(decision === "bid" ? { bid: sealed(supplier, quote, salt()) } : {}),
        rationale: answer.rationale,
        gate,
        source: "llm",
        model,
        turns,
      };
    } catch (err) {
      reason = err.reason ?? "llm_error";
    }
  }
  return pinned(reason);
}
