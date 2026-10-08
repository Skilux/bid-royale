import { timingSafeEqual } from "node:crypto";
import { runSupplier } from "./brain.js";
import { isSupplierId } from "./personas.js";
import { InviteRequest } from "./schemas.js";

const json = (body, status = 200) => Response.json(body, { status });

function secretMatches(given, expected) {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `POST /api/agents/<name>/run`. 404 unknown name, 401 bad secret (also when AGENT_SHARED_SECRET is unset),
 * 400 body fails InviteRequest, otherwise 200 with an InviteResponse (a failing brain answers with the pinned quote).
 */
export async function handleRun({ request, name, env = process.env, fetch: fetchImpl = fetch }) {
  if (!isSupplierId(name)) return json({ error: "unknown_agent", message: `no agent named ${name}` }, 404);
  if (!secretMatches(request.headers.get("x-agent-secret"), env.AGENT_SHARED_SECRET)) {
    return json({ error: "unauthorized", message: "bad or missing x-agent-secret" }, 401);
  }
  const body = await request.json().catch(() => null);
  const parsed = InviteRequest.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_request", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  }
  if (parsed.data.supplier !== name) {
    return json({ error: "invalid_request", message: `body supplier ${parsed.data.supplier} does not match route ${name}` }, 400);
  }
  return json(await runSupplier(parsed.data, { env, fetch: fetchImpl }));
}
