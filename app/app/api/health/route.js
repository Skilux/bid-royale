import { getFlags } from "@/lib/config";
import { createStoreFromEnv } from "@/lib/board";
import { getAdapter } from "@/lib/masumi";
import { describeReplay } from "@/lib/replay";
import { probeTreasury } from "@/lib/treasury/probe";

export const dynamic = "force-dynamic";

const ENV_KEYS = [
  "MASUMI_PAYMENT_BASE_URL",
  "MASUMI_PAYMENT_API_KEY",
  "OPENROUTER_API_KEY",
  "AGENT_SHARED_SECRET",
  "SUPPLIER_INVITE_URLS",
  "SHOP_SIGNING_KEY",
  "BOARD_SIGNING_KEY",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "TREASURY_URL",
  "TREASURY_TOKEN",
  "SUPPLIER_AGENTS",
  "DEMO_MODE",
  "SIMULATE_PAYMENTS",
  "MASUMI_NETWORK",
  "MASUMI_SMART_CONTRACT_ADDRESS",
  ...["BOARD", "CONSUMER", "TECHBLOG", "CODEPODCAST", "DEVNEWSLETTER", "GAMINGFORUM"].map((n) => `MASUMI_KEY_${n}`),
  ...["BOARD", "TECHBLOG", "CODEPODCAST", "DEVNEWSLETTER", "GAMINGFORUM"].map((n) => `MASUMI_AGENT_${n}`),
  "MASUMI_REGISTRY_BASE_URL",
  "MASUMI_REGISTRY_API_KEY",
];

/** Names only, never values. Any other MASUMI_REGISTRY_* var that is set shows up too. */
function envPresence() {
  const extra = Object.keys(process.env).filter((k) => k.startsWith("MASUMI_REGISTRY_"));
  return Object.fromEntries([...new Set([...ENV_KEYS, ...extra])].map((k) => [k, Boolean(process.env[k])]));
}

export async function GET() {
  const treasury = await probeTreasury().catch(() => ({ configured: true, reachable: false, status: null, authOk: null }));
  return Response.json({
    ok: true,
    flags: getFlags(),
    paymentAdapter: getAdapter().badge,
    boardStore: createStoreFromEnv().kind,
    replay: await describeReplay(),
    treasury,
    env: envPresence(),
    time: new Date().toISOString(),
  });
}
