import { getFlags } from "@/lib/config";
import { createStoreFromEnv } from "@/lib/board";
import { getAdapter } from "@/lib/masumi";

export const dynamic = "force-dynamic";

const ENV_KEYS = [
  "MASUMI_PAYMENT_BASE_URL",
  "MASUMI_PAYMENT_API_KEY",
  "OPENAI_API_KEY",
  "SHOP_SIGNING_KEY",
  "BOARD_SIGNING_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
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
