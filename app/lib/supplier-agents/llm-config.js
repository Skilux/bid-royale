/**
 * The one place that defines which LLMs the supplier agents use and what they may spend.
 * Change a model or a cap here. `OPENROUTER_MODELS` (comma list) overrides `models` when set,
 * nothing else reads env for model choice.
 *
 * Worst case per invite: maxCallsPerInvite calls, each at most maxInputChars in and maxOutputTokens out,
 * stopped earlier by maxTokensPerInvite. At the prices below that is far under $0.01 per invite.
 * Prices checked against the OpenRouter models API on 8 Oct 2026 (USD per million tokens, prompt / completion):
 * claude-haiku-5.5 0.10 / 0.50, mimo-v2.6-flash 0.14 / 0.28, gpt-6-luna 0.10 / 0.50, deepseek-v4.1-flash 0.30 / 1.20,
 * glm-5.3-flash 0.15 / 0.50, gpt-oss-120b 0.037 / 0.17, qwen3.7-flash 0.03 / 0.13. All support tools.
 */
export const LLM_CONFIG = {
  /**
   * Tried in order, one per attempt, cycled if there are fewer than maxAttempts. Only the first
   * `maxAttempts` entries are reached in one invite, the rest are reserve: reorder to promote one.
   * Live test on 8 Oct 2026, one persona prompt each: mimo-v2.6-flash and gpt-6-luna 2 of 2 ok (7-10 s),
   * deepseek-v4.1-flash 1 of 2 (once no submit_bid), glm-5.3-flash 0 of 2 (12 s timeout both).
   */
  models: [
    "anthropic/claude-haiku-5.5",
    "xiaomi/mimo-v2.6-flash",
    "openai/gpt-6-luna",
    "deepseek/deepseek-v4.1-flash",
    "z-ai/glm-5.3-flash",
    "openai/gpt-oss-120b",
    "qwen/qwen3.7-flash",
  ],

  maxAttempts: 3,
  maxTurns: 4,
  attemptTimeoutMs: 12_000,
  temperature: 0.4,

  /** Per call. The answer is a small tool call, 280-char rationale at most. */
  maxOutputTokens: 800,
  /** Per call, JSON length of the whole message list. Over it, the call is refused and the quote is pinned. */
  maxInputChars: 8_000,
  /** Past results shown to the model. */
  historyEntries: 5,

  /**
   * Sent as provider.max_price: OpenRouter refuses to route above it, so an expensive provider
   * can never serve a request. USD per million tokens.
   */
  maxPrice: { prompt: 0.5, completion: 2 },

  /** Hard stops per invite (one supplier, all attempts together). */
  maxCallsPerInvite: 6,
  maxTokensPerInvite: 12_000,

  /** Invites per minute the route accepts into the brain, per server instance. Over it: pinned, no LLM call. */
  maxInvitesPerMinute: 24,
};

export function resolveLlmConfig(env = process.env) {
  const models = (env.OPENROUTER_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return { ...LLM_CONFIG, models: models.length ? models : LLM_CONFIG.models };
}
