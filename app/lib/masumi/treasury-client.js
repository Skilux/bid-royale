/** Injectable real-adapter treasury hook. Credentials belong only to this service boundary. */
export function createTreasuryClient({ env = process.env, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async ({ id, verdict, reason, from, to, amount }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (!env.TREASURY_URL || !env.TREASURY_TOKEN) throw new Error("Treasury configuration missing");
      const response = await fetchImpl(`${env.TREASURY_URL.replace(/\/+$/, "")}/transfers`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${env.TREASURY_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, verdict, move: { reason, from, to, amount } }),
      });
      if (!response.ok) throw new Error(`Treasury HTTP ${response.status}`);
      const result = await response.json();
      if (typeof result.state !== "string") throw new Error("Invalid treasury response");
      return { state: result.state, txHash: /^[0-9a-f]{64}$/i.test(result.txHash ?? "") ? result.txHash : null,
        ...(result.error ? { error: result.error } : {}) };
    } catch (error) {
      return { state: "TransferPending", txHash: null, error: controller.signal.aborted ? "Treasury request timed out" : error.message };
    } finally { clearTimeout(timer); }
  };
}
