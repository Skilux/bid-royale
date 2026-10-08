import { createHash } from "node:crypto";

const transferKey = (id) => `treasury:transfer:${createHash("sha256").update(id).digest("hex")}`;

const RUN_TTL_SECONDS = 24 * 60 * 60;
const JOB_TTL_SECONDS = 7 * 24 * 60 * 60;
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
 * @property {(agent: string, id: string) => Promise<object | null>} getJob  Masumi agent job (MIP-003 `/start_job`)
 * @property {(job: {agent: string, id: string}) => Promise<void>} setJob
 * @property {(key: string, ttlSeconds: number) => Promise<boolean>} claim  true if this caller got the lock
 * @property {(key: string) => Promise<void>} release
 * @property {(runId: string) => Promise<void>} markSettling    run has settlement work left (Railway trigger)
 * @property {(runId: string) => Promise<void>} unmarkSettling
 * @property {() => Promise<string[]>} listSettling
 * @property {(runId: string, item: object, opts?: {overwrite?: boolean}) => Promise<"created" | "updated" | "same" | "conflict">} putEvidence
 *   evidence item `{name, hash, size, bytes, ...}`. Without `overwrite` an existing item is never replaced
 * @property {(runId: string, name: string) => Promise<object | null>} getEvidence
 * @property {(runId: string) => Promise<object[]>} listEvidence  every item of the run's bundle, bytes included
 */

/** @returns {BoardStore} */
export function createMemoryStore() {
  const runs = new Map();
  const events = new Map();
  const claims = new Map();
  const jobs = new Map();
  const transfers = new Map();
  const settling = new Set();
  const evidence = new Map();

  return {
    kind: "memory",
    async putEvidence(runId, item, { overwrite = false } = {}) {
      const items = evidence.get(runId) ?? new Map();
      const old = items.get(item.name);
      if (old && !overwrite) return old.hash === item.hash ? "same" : "conflict";
      items.set(item.name, structuredClone(item));
      evidence.set(runId, items);
      return old ? "updated" : "created";
    },
    async getEvidence(runId, name) {
      const item = evidence.get(runId)?.get(name);
      return item ? structuredClone(item) : null;
    },
    async listEvidence(runId) {
      return [...(evidence.get(runId)?.values() ?? [])].map((i) => structuredClone(i));
    },
    async markSettling(runId) { settling.add(runId); },
    async unmarkSettling(runId) { settling.delete(runId); },
    async listSettling() { return [...settling]; },
    async getTransfer(id) { return structuredClone(transfers.get(id) ?? null); },
    async reserveTransfer(id, record) {
      if (transfers.has(id)) return false;
      transfers.set(id, structuredClone({ ...record, id }));
      return true;
    },
    async setTransfer(id, record) { transfers.set(id, structuredClone({ ...record, id })); },
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
    async getJob(agent, id) {
      const job = jobs.get(`${agent}:${id}`);
      return job ? structuredClone(job) : null;
    },
    async setJob(job) {
      jobs.set(`${job.agent}:${job.id}`, structuredClone(job));
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
  const jobKey = (agent, id) => `${PREFIX}:masumi:job:${agent}:${id}`;
  const settlingKey = `${PREFIX}:settling`;
  const evidenceKey = (id) => `${PREFIX}:run:${id}:evidence`;

  return {
    kind: "upstash",
    async putEvidence(runId, item, { overwrite = false } = {}) {
      const key = evidenceKey(runId);
      const body = JSON.stringify(item);
      if (overwrite) {
        const out = await call("/pipeline", [["HSET", key, item.name, body], ["EXPIRE", key, RUN_TTL_SECONDS]]);
        if (out?.[0]?.error) throw new Error(`Upstash: ${out[0].error}`);
        return out?.[0]?.result === 0 ? "updated" : "created";
      }
      const out = await call("/pipeline", [["HSETNX", key, item.name, body], ["EXPIRE", key, RUN_TTL_SECONDS]]);
      if (out?.[0]?.error) throw new Error(`Upstash: ${out[0].error}`);
      if (out?.[0]?.result === 1) return "created";
      const old = await command("HGET", key, item.name);
      return old && JSON.parse(old).hash === item.hash ? "same" : "conflict";
    },
    async getEvidence(runId, name) {
      const raw = await command("HGET", evidenceKey(runId), name);
      return raw ? JSON.parse(raw) : null;
    },
    async listEvidence(runId) {
      const flat = (await command("HGETALL", evidenceKey(runId))) ?? [];
      const items = [];
      for (let i = 1; i < flat.length; i += 2) items.push(JSON.parse(flat[i]));
      return items;
    },
    async markSettling(runId) {
      await command("SADD", settlingKey, runId);
    },
    async unmarkSettling(runId) {
      await command("SREM", settlingKey, runId);
    },
    async listSettling() {
      return (await command("SMEMBERS", settlingKey)) ?? [];
    },
    async getTransfer(id) {
      const raw = await command("GET", transferKey(id));
      return raw ? JSON.parse(raw) : null;
    },
    async reserveTransfer(id, record) {
      return (await command("SET", transferKey(id), JSON.stringify({ ...record, id }), "NX")) === "OK";
    },
    async setTransfer(id, record) {
      await command("SET", transferKey(id), JSON.stringify({ ...record, id }));
    },
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
    async getJob(agent, id) {
      const raw = await command("GET", jobKey(agent, id));
      return raw ? JSON.parse(raw) : null;
    },
    async setJob(job) {
      await command("SET", jobKey(job.agent, job.id), JSON.stringify(job), "EX", JOB_TTL_SECONDS);
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
