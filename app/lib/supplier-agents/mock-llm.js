// Test helper: scripted OpenRouter. Never touches the network.
export const toolCall = (name, args, id = `call_${name}`) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
export const reply = (message) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }] }) });
export const failure = (status) => ({ ok: false, status, json: async () => ({ error: { message: `status ${status}` } }) });

/** A model that calls get_operator_config and estimate_win_chance, then submits `quote`. */
export function submitting(quote, rationale = "Plain quote.") {
  return (body) => {
    const tools = body.messages.filter((m) => m.role === "tool").length;
    if (tools === 0) return reply({ tool_calls: [toolCall("get_operator_config", {})] });
    if (tools === 1) {
      return reply({
        tool_calls: [toolCall("estimate_win_chance", { price: quote.price, impressions: quote.impressions, promisedPer1000: quote.promisedPer1000 })],
      });
    }
    return reply({ tool_calls: [toolCall("submit_bid", { decision: "bid", ...quote, rationale })] });
  };
}

/** fetch whose answer comes from `handler(body, call)`. `hang` honours the abort signal. Records every call. */
export function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    const call = { url, init, body };
    calls.push(call);
    const out = await handler(body, call, calls.length - 1);
    if (out === "hang") {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    return out;
  };
  fn.calls = calls;
  return fn;
}

/** Per-persona quotes: the model answers according to the persona named in the system prompt. */
export function byPersona(quotes) {
  const names = { TechBlog: "techblog", CodePodcast: "codepodcast", DevNewsletter: "devnewsletter", GamingForum: "gamingforum" };
  return (body, call, i) => {
    const sys = body.messages[0].content;
    const id = names[Object.keys(names).find((n) => sys.includes(`You run ${n},`))];
    return submitting(quotes[id])(body, call, i);
  };
}
