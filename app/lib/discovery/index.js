import seedFile from "../../data/seeds/suppliers.json" with { type: "json" };
import { createRegistryClient, isConfirmed } from "../masumi/registry.js";

export const LIVE_LABEL = "Masumi registry";
export const SEEDED_LABEL = "seeded registry";
export const ENDPOINT = "GET /registry (V2 payment source)";

const SEED = seedFile.suppliers;
export const EXPECTED = SEED.length;

const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};
const publicAgent = ({ id, name, persona, agentIdentifier, apiBaseUrl }, state) => ({ supplier: id, name, persona, agentIdentifier, apiBaseUrl, state });

/** The four agents of the seeded registry. */
export const seededAgents = () => SEED.map((s) => publicAgent(s, "seeded"));

/** Which supplier a registry entry is: the last path segment of its `apiBaseUrl`, else its name. The Board agent is none. */
export function supplierIdOf(entry) {
  const ids = SEED.map((s) => s.id);
  let last = null;
  try {
    last = new URL(entry.apiBaseUrl).pathname.split("/").filter(Boolean).at(-1);
  } catch {
    // no usable URL: fall through to the name
  }
  return [last, slug(entry.name)].find((c) => ids.includes(c)) ?? null;
}

const seeded = (reason, extra = {}) => ({
  source: "seeded",
  label: SEEDED_LABEL,
  reason,
  endpoint: ENDPOINT,
  expected: EXPECTED,
  found: 0,
  agents: seededAgents(),
  ...extra,
});

/**
 * Finds the supplier agents for a tender (#44). Live: the Masumi registry on the V2 source. Seeded: `app/data/seeds/suppliers.json`.
 * Never throws and never retries: a timeout, an error, a missing key or fewer than 4 usable agents all give the seeded
 * result with `source: "seeded"` and the reason, so the UI can say "seeded registry" and never presents it as a live lookup.
 *
 * A live entry is kept only if it is confirmed, is one of our four suppliers, has an https `apiBaseUrl` and an agent
 * identifier, and its URL origin is the seeded origin for that supplier. The last rule keeps the agent secret from being
 * sent to a host a registry entry names.
 */
export async function discoverSuppliers({ env = process.env, fetch: fetchImpl, timeoutMs, client } = {}) {
  const registry = client ?? createRegistryClient({ env, fetch: fetchImpl, timeoutMs });
  if (!registry.configured) return seeded("not_configured");

  let listed;
  try {
    listed = await registry.list();
  } catch (err) {
    const message = String(err?.message ?? err).slice(0, 200);
    return seeded(/timed out/i.test(message) ? "timeout" : "error", { detail: message });
  }

  const skipped = [];
  const bySupplier = new Map();
  for (const entry of listed.entries) {
    const supplier = supplierIdOf(entry);
    const skip = (reason) => skipped.push({ name: entry.name, reason });
    if (!supplier) skip("not_a_supplier");
    else if (!isConfirmed(entry)) skip("not_confirmed");
    else if (!entry.agentIdentifier) skip("no_agent_identifier");
    else if (!entry.apiBaseUrl?.startsWith("https://")) skip("no_https_url");
    else if (originOf(entry.apiBaseUrl) !== originOf(SEED.find((s) => s.id === supplier).apiBaseUrl)) skip("untrusted_origin");
    else if (bySupplier.has(supplier)) skip("duplicate");
    else bySupplier.set(supplier, entry);
  }

  const agents = SEED.filter((s) => bySupplier.has(s.id)).map((s) => {
    const e = bySupplier.get(s.id);
    return publicAgent({ ...s, name: e.name ?? s.name, agentIdentifier: e.agentIdentifier, apiBaseUrl: e.apiBaseUrl }, e.state);
  });
  if (agents.length < EXPECTED) return seeded("partial", { found: agents.length, skipped });
  return { source: "live", label: LIVE_LABEL, endpoint: ENDPOINT, expected: EXPECTED, found: agents.length, agents, skipped };
}

/** Supplier id -> invite base URL, from a discovery result. */
export const inviteUrls = (discovery) => Object.fromEntries((discovery?.agents ?? []).map((a) => [a.supplier, a.apiBaseUrl]));
