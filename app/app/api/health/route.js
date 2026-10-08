import { getFlags } from "@/lib/config";
import { getAdapter } from "@/lib/masumi";

export const dynamic = "force-dynamic";

const ENV_KEYS = [
  "MASUMI_PAYMENT_BASE_URL",
  "MASUMI_PAYMENT_API_KEY",
  "OPENAI_API_KEY",
  "SHOP_SIGNING_KEY",
];

export function GET() {
  return Response.json({
    ok: true,
    flags: getFlags(),
    paymentAdapter: getAdapter().badge,
    env: Object.fromEntries(ENV_KEYS.map((k) => [k, Boolean(process.env[k])])),
    time: new Date().toISOString(),
  });
}
