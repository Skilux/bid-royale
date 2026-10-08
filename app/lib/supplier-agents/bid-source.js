import { pinnedResponse, runSupplier } from "./brain.js";
import { SUPPLIER_IDS } from "./personas.js";
import { InviteRequest, InviteResponse } from "./schemas.js";

export const INVITE_TIMEOUT_MS = 45_000;

/** Invite over HTTP: Board -> Railway `POST <base>/tender-invite`. Throws on transport, status or timeout. */
export function railwayInvite({ urls, secret, fetch: fetchImpl = fetch, timeoutMs = INVITE_TIMEOUT_MS }) {
  return async (request) => {
    const base = urls[request.supplier];
    if (!base) throw new Error(`no invite URL for ${request.supplier}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base.replace(/\/+$/, "")}/tender-invite`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-agent-secret": secret ?? "" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error(`${request.supplier} invite answered ${res.status}`);
      return await res.json();
    } catch (err) {
      if (ctrl.signal.aborted) throw Object.assign(new Error(`${request.supplier} invite timed out`), { timeout: true });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Invite in-process: skips Railway, runs the brain directly. For rehearsals and local runs. */
export const localInvite = (deps) => (request) => runSupplier(InviteRequest.parse(request), deps);

/**
 * Board `bidSource` over supplier agents. All suppliers are invited in parallel. A failed invite
 * becomes the pinned quote (`invite_timeout` or `invite_error`). Skips return no entry, so they get
 * no commit and pay no bid fee. `committedAt` is left out: the Board stamps it.
 *
 * @param {{ invite: (request: object) => Promise<object>, referencePrice?: number, suppliers?: string[] }} deps
 */
export function createBidSource({ invite, referencePrice = 1, suppliers = SUPPLIER_IDS }) {
  return async function bidSource({ tender, run }) {
    const reference = { pricePerSignup: referencePrice, source: "operator" };
    const entries = await Promise.all(
      suppliers.map(async (supplier) => {
        const request = { action: "bid", runId: run?.id ?? "run", supplier, tender, reference, history: [] };
        let response;
        try {
          const parsed = InviteResponse.safeParse(await invite(request));
          if (!parsed.success || parsed.data.supplier !== supplier) throw new Error("invalid invite response");
          if (parsed.data.decision === "bid" && !parsed.data.bid) throw new Error("bid response without a bid");
          response = parsed.data;
        } catch (err) {
          response = pinnedResponse({ supplier, tender, reference, reason: err?.timeout ? "invite_timeout" : "invite_error" });
        }
        if (response.decision !== "bid") return null;
        const { price, impressions, promisedPer1000, salt, commit } = response.bid;
        return {
          supplier,
          price,
          impressions,
          promisedPer1000,
          salt,
          commit,
          source: response.source,
          rationale: response.rationale,
          gate: response.gate,
          ...(response.reason ? { reason: response.reason } : {}),
          ...(response.model ? { model: response.model } : {}),
        };
      }),
    );
    return entries.filter(Boolean);
  };
}

/**
 * Bid source for this environment, or undefined to keep the Board's default pinned quotes.
 * `SUPPLIER_INVITE_URLS` (JSON map supplier id -> Railway base URL) selects the Railway path,
 * `SUPPLIER_AGENTS=local` runs the brains in-process.
 */
export function bidSourceFromEnv(env = process.env, { fetch: fetchImpl = fetch } = {}) {
  const referencePrice = Number(env.REFERENCE_PRICE) > 0 ? Number(env.REFERENCE_PRICE) : 1;
  if (env.SUPPLIER_INVITE_URLS) {
    let urls;
    try {
      urls = JSON.parse(env.SUPPLIER_INVITE_URLS);
    } catch {
      urls = {};
    }
    return createBidSource({ invite: railwayInvite({ urls, secret: env.AGENT_SHARED_SECRET, fetch: fetchImpl }), referencePrice });
  }
  if (env.SUPPLIER_AGENTS === "local") return createBidSource({ invite: localInvite({ env, fetch: fetchImpl }), referencePrice });
  return undefined;
}
