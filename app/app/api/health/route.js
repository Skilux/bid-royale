import { getFlags } from "@/lib/config";
import { createStoreFromEnv } from "@/lib/board";
import { getAdapter } from "@/lib/masumi";

export const dynamic = "force-dynamic";

const ENV_KEYS = [
  "MASUMI_PAYMENT_BASE_URL",
  "MASUMI_PAYMENT_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODELS",
  "AGENT_SHARED_SECRET",
  "SUPPLIER_INVITE_URLS",
  "SHOP_SIGNING_KEY",
  "BOARD_SIGNING_KEY",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];

export function GET() {
  return Response.json({
    ok: true,
    flags: getFlags(),
    paymentAdapter: getAdapter().badge,
    boardStore: createStoreFromEnv().kind,
    env: Object.fromEntries(ENV_KEYS.map((k) => [k, Boolean(process.env[k])])),
    time: new Date().toISOString(),
  });
}
