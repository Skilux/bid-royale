/** Small REST client. Mutations are attempted once unless reconciliation proves a retry safe. */
export function createClient({ baseUrl, token, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!baseUrl || !token) throw new Error("Masumi configuration requires a base URL and party key");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Masumi timeout must be positive");

  async function request(path, { method = "GET", body, query } = {}) {
    const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { token, "Content-Type": "application/json" },
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); }
      catch {
        const error = new Error(`Masumi HTTP ${response.status}: non-JSON response`);
        error.status = response.status;
        throw error;
      }
      if (!response.ok) {
        const message = payload.message ?? payload.error?.message ?? payload.error ?? "Request failed";
        const error = new Error(`Masumi HTTP ${response.status}: ${String(message).replaceAll(token, "[redacted]")}`);
        error.status = response.status;
        throw error;
      }
      return payload.data;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Masumi request timed out after ${timeoutMs} ms`, { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    request,
    /** retry.query must read status; decide returns { retry: true } only for proven non-execution. */
    async post(path, body, { retry } = {}) {
      try {
        return await request(path, { method: "POST", body });
      } catch (error) {
        if (!retry || (error.status && error.status < 500)) throw error;
        const { path: statusPath, ...options } = retry.query;
        if ((options.method ?? "GET") !== "GET" &&
            !(options.method === "POST" && ["/payment/resolve-blockchain-identifier", "/purchase/resolve-blockchain-identifier"].includes(statusPath))) {
          throw new Error("Masumi retry requires a read-only status query");
        }
        const status = await request(statusPath, options);
        const decision = retry.decide(status);
        if (decision.retry === true) return request(path, { method: "POST", body });
        if (decision.data !== undefined) return decision.data;
        throw error;
      }
    },
  };
}
