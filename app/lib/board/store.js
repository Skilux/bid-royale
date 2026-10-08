const RUN_TTL_SECONDS = 24 * 60 * 60;
const UPSTASH_TIMEOUT_MS = 5000;
const PREFIX = "bidroyale";

/**
 * Board state store. A run is one JSON document, its events are an append-only list.
 * Event seq numbers are list positions (1-based), so they are assigned on read.
 *
 * @typedef {Object} BoardStore
 * @property {"memory" | "upstash"} kind
 * @property {(id: string) => Promise<object | null>} getRun
 * @property {(run: object) => Promise<void>} setRun
 * @property {(runId: string, event: {ts: string, name: string, data: unknown}) => Promise<number>} appendEvent  returns the seq
 * @property {(runId: string, after?: number) => Promise<{seq: number, ts: string, name: string, data: unknown}[]>} getEvents
 * @property {(key: string, ttlSeconds: number) => Promise<boolean>} claim  true if this caller got the lock
 * @property {(key: string) => Promise<void>} release
 */

/** @returns {BoardStore} */
export function createMemoryStore() {
  const runs = new Map();
  const events = new Map();
  const claims = new Map();

  return {
    kind: "memory",
    async getRun(id) {
      const run = runs.get(id);
      return run ? structuredClone(run) : null;
    },
    async setRun(run) {
      runs.set(run.id, structuredClone(run));
    },
    async appendEvent(runId, event) {
      const list = events.get(runId) ?? [];
      list.push(structuredClone(event));
      events.set(runId, list);
      return list.length;
    },
    async getEvents(runId, after = 0) {
      const list = events.get(runId) ?? [];
      return list.slice(after).map((e, i) => ({ seq: after + i + 1, ...structuredClone(e) }));
    },
    async claim(key, ttlSeconds) {
      const until = claims.get(key);
      if (until && until > Date.now()) return false;
      claims.set(key, Date.now() + ttlSeconds * 1000);
      return true;
    },
    async release(key) {
      claims.delete(key);
    },
  };
}

/**
 * Upstash Redis over its REST API. Every call has an AbortController timeout.
 * Pass `fetchImpl` to test without a network.
 *
 * @returns {BoardStore}
 */
export function createUpstashStore({ url, token, fetchImpl = fetch, timeoutMs = UPSTASH_TIMEOUT_MS }) {
  const base = url.replace(/\/+$/, "");

  async function call(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Upstash ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function command(...args) {
    const { result, error } = await call("", args);
    if (error) throw new Error(`Upstash: ${error}`);
    return result;
  }

  const runKey = (id) => `${PREFIX}:run:${id}`;
  const eventsKey = (id) => `${PREFIX}:run:${id}:events`;
  const claimKey = (key) => `${PREFIX}:claim:${key}`;

  return {
    kind: "upstash",
    async getRun(id) {
      const raw = await command("GET", runKey(id));
      return raw ? JSON.parse(raw) : null;
    },
    async setRun(run) {
      await command("SET", runKey(run.id), JSON.stringify(run), "EX", RUN_TTL_SECONDS);
    },
    async appendEvent(runId, event) {
      const out = await call("/pipeline", [
        ["RPUSH", eventsKey(runId), JSON.stringify(event)],
        ["EXPIRE", eventsKey(runId), RUN_TTL_SECONDS],
      ]);
      const first = out?.[0];
      if (!first || first.error) throw new Error(`Upstash: ${first?.error ?? "empty pipeline response"}`);
      return first.result;
    },
    async getEvents(runId, after = 0) {
      const raw = (await command("LRANGE", eventsKey(runId), after, -1)) ?? [];
      return raw.map((r, i) => ({ seq: after + i + 1, ...JSON.parse(r) }));
    },
    async claim(key, ttlSeconds) {
      return (await command("SET", claimKey(key), "1", "NX", "EX", ttlSeconds)) === "OK";
    },
    async release(key) {
      await command("DEL", claimKey(key));
    },
  };
}

const MEMORY_KEY = "__bidRoyaleBoardMemoryStore";

/** Upstash when the REST env vars are set, otherwise one in-memory store per server process. */
export function createStoreFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) return createUpstashStore({ url, token });
  globalThis[MEMORY_KEY] ??= createMemoryStore();
  return globalThis[MEMORY_KEY];
}
