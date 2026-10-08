import { canonicalHash } from "../signing/canonical.js";
import { sha256Hex } from "../signing/index.js";
import { GROUPS, STEP_ITEMS, verdictItems, verificationItems } from "./items.js";

export { GROUPS } from "./items.js";
export { verifyItem } from "./verify.js";

/** One item may not exceed this. A bigger item is refused, never truncated: a truncated item cannot be verified. */
export const MAX_ITEM_BYTES = 256 * 1024;
/** Item names are path segments in /api/run/<id>/evidence/<name>. */
export const ITEM_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const PUBLIC_FIELDS = ["name", "label", "group", "supplier", "hash", "size", "mutable", "revision", "step"];

/** The listing form of an item: everything except the bytes. */
export const manifestEntry = (item) => Object.fromEntries(PUBLIC_FIELDS.filter((k) => item[k] !== undefined).map((k) => [k, item[k]]));

/** SHA-256 over the canonical list of `{name, hash}`, so one hash covers the whole bundle. */
export function bundleHash(items) {
  const list = items.map((i) => ({ name: i.name, hash: i.hash })).sort((a, b) => a.name.localeCompare(b.name));
  return sha256Hex(canonicalHash(list).text);
}

/** Builds the stored form of an item: the canonical bytes next to their hash. */
export function sealItem({ name, value, ...meta }) {
  if (!ITEM_NAME.test(name)) throw new Error(`evidence item name is not allowed: ${name}`);
  const { text, size, hash } = canonicalHash(value);
  if (size > MAX_ITEM_BYTES) throw new Error(`evidence item ${name} is ${size} bytes, the limit is ${MAX_ITEM_BYTES}`);
  return { name, ...meta, hash, size, bytes: text };
}

/**
 * The evidence bundle of a run, kept in the Board store. Items are written as steps finish, from run state only.
 * Immutable items are written once: the same bytes again are a no-op, different bytes are refused and reported.
 * Mutable items (ledger, settlement, receipt) are replaced when their hash changes, with a revision counter.
 *
 * @param {{ store: import("../board/store.js").BoardStore }} deps
 */
export function createEvidence({ store }) {
  /** Writes the items for one finished step. Returns `{written, unchanged, failed}` item names; never throws on one bad item. */
  async function recordStep(run, step) {
    const build = STEP_ITEMS[step];
    let specs = build ? build(run) : [];
    if (step === "verdicts") {
      const reports = new Map(verificationItems(run).map((i) => [i.supplier, canonicalHash(i.value).hash]));
      specs = verdictItems(run, (supplier) => reports.get(supplier));
    }
    const out = { written: [], unchanged: [], failed: [] };
    await Promise.all(
      specs.map(async (spec) => {
        try {
          const item = sealItem({ ...spec, step });
          if (spec.mutable) {
            const old = await store.getEvidence(run.id, item.name);
            if (old?.hash === item.hash) return void out.unchanged.push(item.name);
            await store.putEvidence(run.id, { ...item, revision: (old?.revision ?? 0) + 1 }, { overwrite: true });
            return void out.written.push(item.name);
          }
          const result = await store.putEvidence(run.id, item);
          if (result === "conflict") throw new Error("a different item with this name already exists");
          (result === "created" ? out.written : out.unchanged).push(item.name);
        } catch (err) {
          out.failed.push({ name: spec.name, error: err.message });
        }
      }),
    );
    return out;
  }

  async function getItem(runId, name) {
    return ITEM_NAME.test(name) ? store.getEvidence(runId, name) : null;
  }

  /** Manifest: names, hashes and sizes, no bytes. `source` is how the reader should label the bundle. */
  async function manifest(runId, { source = "live" } = {}) {
    const items = (await store.listEvidence(runId)).sort((a, b) => a.name.localeCompare(b.name));
    return {
      runId,
      source,
      count: items.length,
      bundleHash: items.length ? bundleHash(items) : null,
      groups: GROUPS,
      items: items.map(manifestEntry),
    };
  }

  /** Every item with its bytes, for a canned recording. */
  const exportBundle = async (runId) => (await store.listEvidence(runId)).sort((a, b) => a.name.localeCompare(b.name));

  /** Restores a recorded bundle under a new run id. Recorded items replace anything with the same name. */
  async function importBundle(runId, items = []) {
    for (const item of items) await store.putEvidence(runId, item, { overwrite: true });
  }

  /** Hash of a named item, or null. For wiring a hash into a chain call without reading bytes. */
  async function hashOf(runId, name) {
    return (await getItem(runId, name))?.hash ?? null;
  }

  return { recordStep, getItem, manifest, exportBundle, importBundle, hashOf };
}
