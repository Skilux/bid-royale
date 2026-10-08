import { z } from "zod";
import { estimateWinChance } from "./gate.js";
import { QuoteArgs, bidFor } from "./schemas.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import { LLM_CONFIG } from "./llm-config.js";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Spend meter for one invite, shared by all its attempts. */
export const newMeter = () => ({ calls: 0, tokens: 0 });

export const ERROR_BODY_MAX = 200;

/** Error text safe to return and log: the API key and anything key-shaped removed, cut to 200 characters. */
export function safeDetail(text, apiKey) {
  let out = String(text ?? "");
  if (apiKey) out = out.split(apiKey).join("[redacted]");
  return out.replace(/sk-or-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, ERROR_BODY_MAX);
}

/** Failure with a category the route reports as `reason`: llm_error, zod, timeout or budget. `status` and `detail` carry the HTTP cause. */
export class AttemptError extends Error {
  constructor(reason, message, { status, detail } = {}) {
    super(message);
    this.reason = reason;
    this.status = status;
    this.detail = detail;
  }
}

async function errorBody(res, apiKey) {
  try {
    return safeDetail(typeof res.text === "function" ? await res.text() : JSON.stringify(await res.json()), apiKey);
  } catch {
    return "";
  }
}

/** The last turn must answer: a model that keeps probing `estimate_win_chance` is made to call `submit_bid`. */
const FORCE_SUBMIT = { type: "function", function: { name: "submit_bid" } };

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
 * One attempt: one model, one OpenRouter tool-calling loop of up to `config.maxTurns` turns, one AbortSignal.
 * Returns the validated `submit_bid` arguments. Throws AttemptError.
 */
export async function runAttempt({ fetch, apiKey, model, persona, tender, reference, history, config = LLM_CONFIG, meter = newMeter(), timeoutMs = config.attemptTimeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const tools = toolDefs(persona);
  const schema = bidFor(persona.id);
  const ctx = { persona, tender, reference: reference.pricePerSignup };
  const messages = [
    { role: "system", content: systemPrompt({ persona, tender, reference, history: history.slice(-config.historyEntries) }) },
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

  // Reasoning off keeps a turn at 1 to 3 s instead of 6 to 9 s on reasoning models, and their token budget is not spent thinking.
  // A model that insists on reasoning answers 400: ask again with it on.
  let reasoning = { reasoning: { enabled: false } };
  const post = (body) => {
    meter.calls += 1;
    return fetch(OPENROUTER_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
    });
  };

  try {
    for (let turn = 1; turn <= config.maxTurns; turn++) {
      if (meter.calls >= config.maxCallsPerInvite) throw new AttemptError("budget", `call cap ${config.maxCallsPerInvite} reached`);
      if (meter.tokens >= config.maxTokensPerInvite) throw new AttemptError("budget", `token cap ${config.maxTokensPerInvite} reached`);
      const body = JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: turn === config.maxTurns ? FORCE_SUBMIT : "auto",
        temperature: config.temperature,
        max_tokens: config.maxOutputTokens,
        provider: { max_price: config.maxPrice },
        ...reasoning,
      });
      if (JSON.stringify(messages).length > config.maxInputChars) throw new AttemptError("budget", `input over ${config.maxInputChars} chars`);
      let res = await post(body);
      if (res.status === 400 && reasoning.reasoning) {
        const detail = await errorBody(res, apiKey);
        if (!/reasoning/i.test(detail)) throw new AttemptError("llm_error", `OpenRouter 400 from ${model}`, { status: 400, detail });
        reasoning = {};
        res = await post(JSON.stringify({ ...JSON.parse(body), reasoning: undefined }));
      }
      if (!res.ok) throw new AttemptError("llm_error", `OpenRouter ${res.status} from ${model}`, { status: res.status, detail: await errorBody(res, apiKey) });
      const payload = await res.json();
      meter.tokens += Number(payload?.usage?.total_tokens) || Math.ceil((body.length + JSON.stringify(payload).length) / 4);
      const message = payload?.choices?.[0]?.message;
      if (!message) {
        const detail = safeDetail(payload?.error ? JSON.stringify(payload.error) : "empty response", apiKey);
        throw new AttemptError("llm_error", `no message from ${model}`, { status: res.status, detail });
      }

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
    throw new AttemptError("llm_error", `${model} did not call submit_bid in ${config.maxTurns} turns`);
  } catch (err) {
    if (err instanceof AttemptError) throw err;
    if (ctrl.signal.aborted) throw new AttemptError("timeout", `${model} timed out after ${timeoutMs} ms`);
    throw new AttemptError("llm_error", `${model}: ${err?.message ?? err}`, { detail: safeDetail(err?.cause?.message ?? err?.message ?? err, apiKey) });
  } finally {
    clearTimeout(timer);
  }
}
