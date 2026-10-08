import { z } from "zod";
import { estimateWinChance } from "./gate.js";
import { QuoteArgs, bidFor } from "./schemas.js";
import { systemPrompt, userPrompt } from "./prompt.js";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const ATTEMPT_TIMEOUT_MS = 12_000;
export const MAX_ATTEMPTS = 3;
export const MAX_TURNS = 4;

/** Failure with a category the route reports as `reason`: llm_error, zod or timeout. */
export class AttemptError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

const jsonSchema = (schema) => {
  const { $schema, ...rest } = z.toJSONSchema(schema);
  return rest;
};

function toolDefs(persona) {
  const fn = (name, description, schema) => ({ type: "function", function: { name, description, parameters: jsonSchema(schema) } });
  return [
    fn("get_operator_config", "Your cost, minimum margin, clamps, reference price and past results.", z.object({})),
    fn("estimate_win_chance", "Win chance, margin and expected value of a quote. Exact rule, run it before submitting.", QuoteArgs),
    fn("submit_bid", "Final answer. Ends the run.", bidFor(persona.id)),
  ];
}

const isPositive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * One attempt: one model, one OpenRouter tool-calling loop of up to `MAX_TURNS` turns, one AbortSignal.
 * Returns the validated `submit_bid` arguments. Throws AttemptError.
 */
export async function runAttempt({ fetch, apiKey, model, persona, tender, reference, history, timeoutMs = ATTEMPT_TIMEOUT_MS }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const tools = toolDefs(persona);
  const schema = bidFor(persona.id);
  const ctx = { persona, tender, reference: reference.pricePerSignup };
  const messages = [
    { role: "system", content: systemPrompt({ persona, tender, reference, history }) },
    { role: "user", content: userPrompt(persona) },
  ];

  const runTool = (name, args) => {
    if (name === "get_operator_config") {
      return { costPer1000: persona.costPer1000, minMargin: persona.minMargin, clamps: persona.clamps, reference, history };
    }
    if (name === "estimate_win_chance") {
      const q = QuoteArgs.safeParse(args);
      if (!q.success || !isPositive(q.data.price) || !isPositive(q.data.impressions) || !isPositive(q.data.promisedPer1000)) {
        return { error: "price, impressions and promisedPer1000 must be positive numbers" };
      }
      return estimateWinChance(q.data, ctx);
    }
    return { error: `unknown tool ${name}` };
  };

  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.4, max_tokens: 700 }),
      });
      if (!res.ok) throw new AttemptError("llm_error", `OpenRouter ${res.status} from ${model}`);
      const payload = await res.json();
      const message = payload?.choices?.[0]?.message;
      if (!message) throw new AttemptError("llm_error", `no message from ${model}: ${payload?.error?.message ?? "empty"}`);

      const calls = message.tool_calls ?? [];
      messages.push({ role: "assistant", content: message.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
      if (calls.length === 0) {
        messages.push({ role: "user", content: "Call submit_bid with your final answer." });
        continue;
      }

      for (const call of calls) {
        let args;
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          throw new AttemptError("zod", `${model} sent unparsable ${call.function?.name} arguments`);
        }
        if (call.function?.name === "submit_bid") {
          const parsed = schema.safeParse(args);
          if (!parsed.success) throw new AttemptError("zod", `${model} submit_bid failed validation: ${parsed.error.issues[0]?.message}`);
          return { answer: parsed.data, turns: turn };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(runTool(call.function?.name, args)) });
      }
    }
    throw new AttemptError("llm_error", `${model} did not call submit_bid in ${MAX_TURNS} turns`);
  } catch (err) {
    if (err instanceof AttemptError) throw err;
    if (ctrl.signal.aborted) throw new AttemptError("timeout", `${model} timed out after ${timeoutMs} ms`);
    throw new AttemptError("llm_error", `${model}: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}
