const PROBE_TIMEOUT_MS = 3000;
const PROBE_ID = "health-probe";

/**
 * Checks the treasury worker from the deployed app, for /api/health. Vercel hides Sensitive vars, so this is the only
 * way to see that TREASURY_URL and TREASURY_TOKEN work. Calls GET /transfers/<unknown id> with the bearer token:
 * the worker answers 401 for a wrong token and 404 {state: "NotFound"} for a right one. It reads one store key and
 * touches no chain. Never returns or logs the URL or the token. Never throws.
 *
 * authOk: true = token accepted, false = worker rejected it, null = not decidable (no token, no answer, or the
 * answer did not come from the worker).
 *
 * @returns {Promise<{configured: boolean, reachable: boolean, status: number | null, authOk: boolean | null}>}
 */
export async function probeTreasury({ env = process.env, fetch: fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const base = env.TREASURY_URL?.trim().replace(/\/+$/, "");
  if (!base) return { configured: false, reachable: false, status: null, authOk: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = env.TREASURY_TOKEN;
    const response = await fetchImpl(token ? `${base}/transfers/${PROBE_ID}` : `${base}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const status = response.status;
    if (!token) return { configured: true, reachable: true, status, authOk: null };
    if (status === 401 || status === 403) return { configured: true, reachable: true, status, authOk: false };
    const body = await response.json().catch(() => null);
    const fromWorker = (status === 200 || status === 404) && typeof body?.state === "string";
    return { configured: true, reachable: true, status, authOk: fromWorker ? true : null };
  } catch {
    return { configured: true, reachable: false, status: null, authOk: null };
  } finally {
    clearTimeout(timer);
  }
}
