import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@/lib/masumi/client";
import { paymentDeadlines } from "@/lib/masumi/deadlines";
import { lovelace } from "@/lib/masumi/real";
import { createStoreFromEnv } from "@/lib/board/store";
import { inputSchema, isAgentName, priceFor, validateInput } from "@/lib/masumi/agent-schemas";

/**
 * MIP-003 routes for one registered agent, served from `/api/agents/<name>/...`.
 * Each agent only ever uses its own key (`MASUMI_KEY_<NAME>`) and agent id (`MASUMI_AGENT_<NAME>`).
 * No work runs here: settlement drives the escrow, these routes make the agent discoverable and buyable.
 */

const ERROR_STATES = new Set(["RefundRequested", "Disputed", "RefundAuthorized", "RefundWithdrawn", "DisputedWithdrawn", "FundsOrDatumInvalid"]);
const DONE_STATES = new Set(["ResultSubmitted", "WithdrawAuthorized", "Withdrawn"]);

const json = (body, status = 200) => Response.json(body, { status });
const fail = (status, message) => json({ status: "error", message }, status);

class ConfigError extends Error {}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** MIP-003 input hash: sha256 hex of `<identifier_from_purchaser>;<canonical input_data JSON>`. */
export function inputHash(identifierFromPurchaser, inputData) {
  return createHash("sha256").update(`${identifierFromPurchaser};${canonical(inputData)}`).digest("hex");
}

function settings(name, env) {
  const upper = name.toUpperCase();
  const missing = ["MASUMI_PAYMENT_BASE_URL", "MASUMI_NETWORK", "MASUMI_SMART_CONTRACT_ADDRESS", `MASUMI_KEY_${upper}`, `MASUMI_AGENT_${upper}`]
    .filter((key) => !env[key]);
  if (missing.length) throw new ConfigError(`Masumi configuration missing ${missing.join(", ")}`);
  if (env.MASUMI_NETWORK !== "Preprod") throw new ConfigError("Masumi demo requires MASUMI_NETWORK=Preprod");
  return {
    baseUrl: env.MASUMI_PAYMENT_BASE_URL,
    token: env[`MASUMI_KEY_${upper}`],
    agentIdentifier: env[`MASUMI_AGENT_${upper}`],
    network: env.MASUMI_NETWORK,
    contract: env.MASUMI_SMART_CONTRACT_ADDRESS,
  };
}

function guard(name, handler) {
  return async (...args) => {
    if (!isAgentName(name)) return fail(404, `no agent named ${name}`);
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ConfigError) return fail(503, error.message);
      return fail(error.status ? 502 : 500, `${error.message}`.slice(0, 300));
    }
  };
}

export function availability(name, { env = process.env } = {}) {
  return guard(name, async () => {
    try {
      settings(name, env);
      return json({ status: "available", type: "masumi-agent", message: "Ready to accept jobs" });
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      return json({ status: "unavailable", type: "masumi-agent", message: "Masumi configuration incomplete" });
    }
  })();
}

export function getInputSchema(name) {
  return guard(name, async () => json(inputSchema(name)))();
}

export function startJob(name, request, { env = process.env, fetch, timeoutMs, store = createStoreFromEnv(), now = Date.now } = {}) {
  return guard(name, async () => {
    const body = await request.json().catch(() => null);
    const identifier = body?.identifier_from_purchaser;
    if (typeof identifier !== "string" || !/^(?:[0-9a-fA-F]{2}){7,13}$/.test(identifier)) {
      return fail(400, "identifier_from_purchaser must be a hex string of 14 to 26 characters");
    }
    const invalid = validateInput(name, body.input_data);
    if (invalid) return fail(400, invalid);

    const config = settings(name, env);
    const hash = inputHash(identifier, body.input_data);
    const client = createClient({ baseUrl: config.baseUrl, token: config.token, fetch, timeoutMs });
    const payment = await client.post("/payment", {
      network: config.network,
      agentIdentifier: config.agentIdentifier,
      inputHash: hash,
      identifierFromPurchaser: identifier,
      paymentSourceType: "Web3CardanoV2",
      supportedPaymentSourceIndex: 0,
      RequestedFunds: [{ amount: lovelace(priceFor(name, body.input_data)), unit: "" }],
      ...paymentDeadlines({ now: now() }),
      forceLayer: "L1",
    });
    const sellerVKey = payment.SmartContractWallet?.walletVkey;
    if (!payment.blockchainIdentifier || !sellerVKey) {
      throw new Error("Masumi payment response missing blockchainIdentifier or seller walletVkey");
    }

    const job = {
      agent: name,
      id: randomUUID(),
      blockchainIdentifier: payment.blockchainIdentifier,
      identifierFromPurchaser: identifier,
      inputHash: hash,
      payByTime: payment.payByTime,
      createdAt: new Date(now()).toISOString(),
    };
    await store.setJob(job);
    return json({
      status: "success",
      id: job.id,
      blockchainIdentifier: job.blockchainIdentifier,
      payByTime: payment.payByTime,
      submitResultTime: payment.submitResultTime,
      unlockTime: payment.unlockTime,
      externalDisputeUnlockTime: payment.externalDisputeUnlockTime,
      agentIdentifier: config.agentIdentifier,
      sellerVKey,
      identifierFromPurchaser: identifier,
      input_hash: hash,
    });
  })();
}

/** MIP-003 status from the node's on-chain state. No state yet means the buyer has not locked funds. */
function mapStatus(job, payment, nowMs) {
  const state = payment.onChainState;
  if (DONE_STATES.has(state)) return { status: "completed", ...(payment.resultHash ? { result: payment.resultHash } : {}) };
  if (ERROR_STATES.has(state)) return { status: "failed", message: `Escrow state ${state}` };
  if (!state) {
    return Number(job.payByTime) < nowMs
      ? { status: "failed", message: "Payment window expired" }
      : { status: "awaiting_payment" };
  }
  return { status: "running", message: `Escrow state ${state}` };
}

export function jobStatus(name, jobId, { env = process.env, fetch, timeoutMs, store = createStoreFromEnv(), now = Date.now } = {}) {
  return guard(name, async () => {
    if (!jobId) return fail(400, "job_id is required");
    const job = await store.getJob(name, jobId);
    if (!job) return fail(404, `no job ${jobId}`);
    const config = settings(name, env);
    const client = createClient({ baseUrl: config.baseUrl, token: config.token, fetch, timeoutMs });
    const payment = await client.post("/payment/resolve-blockchain-identifier", {
      network: config.network,
      filterSmartContractAddress: config.contract,
      blockchainIdentifier: job.blockchainIdentifier,
    });
    return json({ id: job.id, ...mapStatus(job, payment, now()) });
  })();
}
