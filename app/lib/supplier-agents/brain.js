import { randomBytes } from "node:crypto";
import { commit } from "../auction/index.js";
import { estimateWinChance } from "./gate.js";
import { newMeter, runAttempt, safeDetail } from "./llm.js";
import { resolveLlmConfig } from "./llm-config.js";
import { PERSONAS } from "./personas.js";

const newSalt = () => randomBytes(16).toString("hex");

function sealed(supplier, quote, salt) {
  return { supplier, ...quote, salt, commit: commit({ ...quote, salt }) };
}

/** The persona's pinned quote as an InviteResponse. Pinned quotes bypass the gate: they are the anchors. */
export function pinnedResponse({ supplier, tender, reference, reason, salt = newSalt(), usage, attempts }) {
  const persona = PERSONAS[supplier];
  return {
    supplier,
    decision: "bid",
    bid: sealed(supplier, persona.pinned, salt),
    rationale: `Pinned quote (${reason}).`,
    gate: estimateWinChance(persona.pinned, { persona, tender, reference: reference.pricePerSignup }),
    source: "pinned",
    reason,
    ...(usage ? { usage } : {}),
    ...(attempts?.length ? { attempts } : {}),
  };
}

/**
 * One supplier brain: LLM quote via OpenRouter, gate in code, salt and commit in code.
 * Any failure ends in the pinned quote, never in an exception. Every failed attempt is returned as `attempts`
 * (model, reason, HTTP status, first 200 characters of the error, never the key) and written to `log`.
 *
 * @param {object} request  a parsed InviteRequest
 * @param {{ env?: object, fetch?: typeof fetch, newSalt?: () => string, attemptTimeoutMs?: number, log?: (line: string) => void }} [deps]
 */
export async function runSupplier(
  request,
  { env = process.env, fetch: fetchImpl = fetch, newSalt: salt = newSalt, attemptTimeoutMs, log = console.error } = {},
) {
  const { supplier, tender, reference, history } = request;
  const persona = PERSONAS[supplier];
  const meter = newMeter();
  const attempts = [];
  const pinned = (reason) => pinnedResponse({ supplier, tender, reference, reason, salt: salt(), usage: meter.calls ? { ...meter } : undefined, attempts });
  const fail = (model, err) => {
    const record = {
      model,
      reason: err.reason ?? "llm_error",
      ...(err.status ? { status: err.status } : {}),
      error: safeDetail(err.detail || err.message, env.OPENROUTER_API_KEY),
    };
    attempts.push(record);
    log(`supplier-agents ${supplier} attempt failed ${JSON.stringify(record)}`);
    return record.reason;
  };

  if (env.PERSONA_MODE === "pinned") return pinned("forced");

  const config = resolveLlmConfig(env);
  if (!env.OPENROUTER_API_KEY) return pinned(fail("", { message: "OPENROUTER_API_KEY is not set" }));

  let reason = "llm_error";
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const model = config.models[attempt % config.models.length];
    try {
      const { answer, turns } = await runAttempt({
        fetch: fetchImpl,
        apiKey: env.OPENROUTER_API_KEY,
        model,
        persona,
        tender,
        reference,
        history,
        config,
        meter,
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
        usage: { ...meter },
        ...(attempts.length ? { attempts } : {}),
      };
    } catch (err) {
      reason = fail(model, err);
      if (reason === "budget") break;
    }
  }
  return pinned(reason);
}
