import { createClient } from "./client.js";

export const REGISTRY_TIMEOUT_MS = 5000;
export const REGISTRY_LIMIT = 50;

/** Registry states that mean the entry is registered and confirmed. Node states and registry-service statuses. */
const CONFIRMED = new Set(["RegistrationConfirmed", "Online"]);

/** The entry list inside the response `data`. The node documents `Assets`; other casings and a bare array are tolerated. */
function entriesOf(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["Assets", "assets", "Entries", "entries", "RegistryEntries", "items"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

const text = (v) => (typeof v === "string" && v.length > 0 ? v : null);

/** One registry entry as the Board needs it. Fields the node did not send stay null. */
export function normalizeEntry(entry) {
  return {
    name: text(entry?.name),
    agentIdentifier: text(entry?.agentIdentifier),
    apiBaseUrl: text(entry?.apiBaseUrl),
    state: text(entry?.state) ?? text(entry?.status),
  };
}

export const isConfirmed = (entry) => CONFIRMED.has(entry.state);

/**
 * Registry reads for supplier discovery (#44). Read-only: one GET on the Masumi node, a Read-only key, no retry.
 * `GET /registry?network=<net>&filterSmartContractAddress=<V2 contract>` is the V2 view. Without a V2 selector the node
 * answers with the V1 view, so one of the two selectors is always sent (the contract address wins).
 * `MASUMI_REGISTRY_BASE_URL` falls back to `MASUMI_PAYMENT_BASE_URL`: the registry endpoint lives on the same node.
 *
 * @returns {{ configured: boolean, list: () => Promise<{ entries: object[], raw: number }> }}
 */
export function createRegistryClient({ env = process.env, fetch: fetchImpl, timeoutMs = REGISTRY_TIMEOUT_MS } = {}) {
  const baseUrl = env.MASUMI_REGISTRY_BASE_URL || env.MASUMI_PAYMENT_BASE_URL;
  const token = env.MASUMI_REGISTRY_API_KEY;
  const configured = Boolean(baseUrl && token);

  return {
    configured,
    async list() {
      if (!configured) throw Object.assign(new Error("registry lookup is not configured"), { code: "not_configured" });
      const client = createClient({ baseUrl, token, fetch: fetchImpl, timeoutMs });
      const selector = env.MASUMI_SMART_CONTRACT_ADDRESS
        ? { filterSmartContractAddress: env.MASUMI_SMART_CONTRACT_ADDRESS }
        : { filterPaymentSourceType: "Web3CardanoV2" };
      const data = await client.request("/registry", {
        query: { network: env.MASUMI_NETWORK || "Preprod", limit: String(REGISTRY_LIMIT), ...selector },
      });
      const raw = entriesOf(data);
      return { entries: raw.map(normalizeEntry), raw: raw.length };
    },
  };
}
