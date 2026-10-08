import { getFlags } from "@/lib/config";
import { getAdapter } from "@/lib/masumi";
import { bidSourceFromEnv } from "@/lib/supplier-agents";
import { BoardError, createBoard, createStoreFromEnv } from "./index.js";
import { getCannedReplay } from "./canned.js";

/** The Board for this request. State lives in the store, so a fresh object per call is cheap. */
export function getBoard() {
  return createBoard({
    store: createStoreFromEnv(),
    adapter: getAdapter(),
    flags: getFlags,
    canned: getCannedReplay(),
    bidSource: bidSourceFromEnv(),
  });
}

/** Runs a route body and turns Board and store errors into JSON responses. Never throws. */
export async function respond(body, { status = 200 } = {}) {
  try {
    return Response.json(await body(), { status });
  } catch (err) {
    if (err instanceof BoardError) {
      return Response.json({ error: err.code, message: err.message, ...err.extra }, { status: err.status });
    }
    const store = /^Upstash/.test(err?.message ?? "");
    return Response.json(
      { error: store ? "store_unavailable" : "step_failed", message: err?.message ?? String(err) },
      { status: store ? 503 : 500 },
    );
  }
}
