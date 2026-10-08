import { BoardError } from "../board/events.js";
import { isSupplierId } from "../supplier-agents/personas.js";
import { secretMatches } from "../supplier-agents/handler.js";

const json = (body, status = 200) => Response.json(body, { status });

/**
 * `POST /api/agents/<name>/delivery`: a supplier agent posts its delivery report after serving traffic (#51).
 * 404 unknown agent, 401 bad `x-agent-secret` (also when AGENT_SHARED_SECRET is unset, same as /tender-invite),
 * 400 body is not JSON or does not match the format, 404 unknown run, 409 not a winner, no allocation yet or a different
 * report already stored, 200 with `{status: "created" | "same", reportHash}`. Never throws.
 */
export async function handleDelivery({ request, name, env = process.env, board }) {
  if (!isSupplierId(name)) return json({ error: "unknown_agent", message: `no agent named ${name}` }, 404);
  if (!secretMatches(request.headers.get("x-agent-secret"), env.AGENT_SHARED_SECRET)) {
    return json({ error: "unauthorized", message: "bad or missing x-agent-secret" }, 401);
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "invalid_request", message: "body must be a JSON object" }, 400);
  if (typeof body.runId !== "string" || !body.runId) return json({ error: "invalid_report", message: "runId is required" }, 400);
  try {
    // The Board needs Next's `@/` aliases, so it is loaded on use. Tests inject their own.
    const getBoard = board ?? (await import("../board/service.js")).getBoard;
    return json(await getBoard().submitDeliveryReport(body.runId, name, body));
  } catch (err) {
    if (err instanceof BoardError) return json({ error: err.code, message: err.message, ...err.extra }, err.status);
    const store = /^Upstash/.test(err?.message ?? "");
    return json({ error: store ? "store_unavailable" : "failed", message: err?.message ?? String(err) }, store ? 503 : 500);
  }
}
