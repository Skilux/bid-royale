import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { installNextResolution } from "../lib/board/test-alias.js";
installNextResolution();
const { createUpstashStore } = await import("@/lib/board/store");
const { createClient } = await import("@/lib/masumi/client");
const { executeTransfer, getTransferStatus } = await import("@/lib/treasury");

const parties = ["CONSUMER", "TECHBLOG", "CODEPODCAST", "DEVNEWSLETTER", "GAMINGFORUM"];
export function loadConfig(env = process.env) {
  const required = ["MASUMI_PAYMENT_BASE_URL", "MASUMI_ADMIN_KEY", "TREASURY_TOKEN", "BOARD_PUBLIC_KEY",
    "TREASURY_FROM_ADDRESS", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
    ...parties.map((party) => `TREASURY_ADDRESS_${party}`)];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Treasury missing environment: ${missing.join(", ")}`);
  if (!/^[0-9a-f]{64}$/i.test(env.BOARD_PUBLIC_KEY)) throw new Error("BOARD_PUBLIC_KEY must be 64 hex characters");
  return { token: env.TREASURY_TOKEN, boardPublicKey: env.BOARD_PUBLIC_KEY,
    fromAddress: env.TREASURY_FROM_ADDRESS,
    addresses: Object.fromEntries(parties.map((party) => [party.toLowerCase(), env[`TREASURY_ADDRESS_${party}`]])),
    store: createUpstashStore({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
    client: createClient({ baseUrl: env.MASUMI_PAYMENT_BASE_URL, token: env.MASUMI_ADMIN_KEY }) };
}

/** Exported handler permits offline HTTP tests without binding a port. */
export function createHandler(config) {
  return async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    const url = new URL(req.url, "http://treasury.local");
    if (req.method === "GET" && url.pathname === "/health") return send(200, { ok: true });
    const actual = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(401, { error: "Unauthorized" });
    try {
      if (req.method === "POST" && url.pathname === "/transfers") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 128000) return send(413, { error: "Body too large" });
        }
        const { id, verdict, move } = JSON.parse(body);
        const result = await executeTransfer({ ...config, id, verdict, move });
        return send(200, { id, ...result });
      }
      if (req.method === "GET" && url.pathname.startsWith("/transfers/")) {
        const id = decodeURIComponent(url.pathname.slice("/transfers/".length));
        const result = await getTransferStatus({ ...config, id });
        return send(result.state === "NotFound" ? 404 : 200, { id, ...result });
      }
      return send(404, { error: "NotFound" });
    } catch { return send(400, { error: "Invalid request" }); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createServer(createHandler(loadConfig()));
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
