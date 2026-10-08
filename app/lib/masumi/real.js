import { createHash, randomBytes } from "node:crypto";
import { planSettlement } from "@/lib/settlement/plan";
import { simulatedAdapter } from "@/lib/masumi/simulated";
import { createClient } from "@/lib/masumi/client";
import { paymentDeadlines } from "@/lib/masumi/deadlines";

const PARTIES = new Set(["consumer", "board", "techblog", "codepodcast", "devnewsletter", "gamingforum"]);
const OPERATIONS = {
  "submit-result": { side: "payment", queued: ["SubmitResultRequested", "SubmitResultInitiated"] },
  "authorize-refund": { side: "payment", queued: ["AuthorizeRefundRequested", "AuthorizeRefundInitiated"] },
  "request-refund": { side: "purchase", queued: ["SetRefundRequestedRequested", "SetRefundRequestedInitiated"] },
};
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const encode = (job) => `masumi_${Buffer.from(JSON.stringify(job)).toString("base64url")}`;
function decode(id) {
  if (!id?.startsWith("masumi_")) return null;
  try { return JSON.parse(Buffer.from(id.slice(7), "base64url").toString()); } catch { return null; }
}

export function lovelace(amount) {
  const value = Math.round(amount * 1e6);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(value) || Math.abs(value / 1e6 - amount) > 1e-10) {
    throw new Error("Masumi amount must be positive ADA with at most six decimal places");
  }
  return String(value);
}

/** Pending is explicit: a REAL badge requires a service-reported Cardano transaction hash. */
function receipt(job, action, amount, from, to, data = {}, error) {
  const candidate = data.CurrentTransaction?.txHash;
  const txHash = /^[0-9a-f]{64}$/i.test(candidate ?? "") ? candidate : null;
  return {
    id: encode(job), badge: txHash ? "REAL" : "PENDING", action, amount, from, to,
    txHash, explorerUrl: txHash ? `https://preprod.cardanoscan.io/transaction/${txHash}` : null,
    state: error ? "Error" : data.onChainState ?? data.NextAction?.requestedAction ?? "Pending",
    ...(error ? { error: error.message } : {}),
  };
}

/** Keys are read lazily; callers receive Error receipts for configuration/API failures. */
export function createRealAdapter({ env = process.env, fetch, timeoutMs, now = Date.now, marginMs, treasury } = {}) {
  const locks = new Map();
  const transferResults = new Map();
  function config() {
    for (const name of ["MASUMI_PAYMENT_BASE_URL", "MASUMI_NETWORK", "MASUMI_SMART_CONTRACT_ADDRESS"]) {
      if (!env[name]) throw new Error(`Masumi configuration missing ${name}`);
    }
    if (env.MASUMI_NETWORK !== "Preprod") throw new Error("Masumi demo requires MASUMI_NETWORK=Preprod");
    return { network: env.MASUMI_NETWORK, filterSmartContractAddress: env.MASUMI_SMART_CONTRACT_ADDRESS };
  }
  function client(party) {
    config();
    if (!PARTIES.has(party)) throw new Error(`Unknown Masumi party: ${party}`);
    const name = `MASUMI_KEY_${party.toUpperCase()}`;
    if (!env[name]) throw new Error(`Masumi configuration missing ${name}`);
    return createClient({ baseUrl: env.MASUMI_PAYMENT_BASE_URL, token: env[name], fetch, timeoutMs });
  }
  async function status(job, side = "payment") {
    return client(side === "payment" ? job.seller : job.buyer).post(`/${side}/resolve-blockchain-identifier`, {
      ...config(), blockchainIdentifier: job.blockchainIdentifier,
    });
  }
  async function lock(action, { supplier, amount }) {
    const seller = action === "award" ? supplier : "board";
    const buyer = action === "award" ? "consumer" : supplier;
    const job = { supplier, action, seller, buyer, nonce: randomBytes(12).toString("hex") };
    try {
      // Validate both parties before creating seller-side terms.
      const sell = client(seller);
      const buy = client(buyer);
      const agentName = `MASUMI_AGENT_${seller.toUpperCase()}`;
      if (!env[agentName]) throw new Error(`Masumi configuration missing ${agentName}`);
      const deadlines = paymentDeadlines({ now: now(), marginMs });
      const funds = [{ amount: lovelace(amount), unit: "" }];
      const inputHash = hash({ action, supplier, amount, nonce: job.nonce });
      const payment = await sell.post("/payment", {
        network: config().network, agentIdentifier: env[agentName], inputHash,
        identifierFromPurchaser: job.nonce, paymentSourceType: "Web3CardanoV2",
        supportedPaymentSourceIndex: 0, RequestedFunds: funds, ...deadlines, forceLayer: "L1",
      });
      job.blockchainIdentifier = payment.blockchainIdentifier;
      if (!job.blockchainIdentifier || !payment.SmartContractWallet?.walletVkey) {
        throw new Error("Masumi payment response missing blockchainIdentifier or seller walletVkey");
      }
      if (payment.PaymentSource?.smartContractAddress !== env.MASUMI_SMART_CONTRACT_ADDRESS) {
        throw new Error("Masumi payment source does not match configured V2 contract");
      }
      locks.set(`${supplier}:${action}`, job);
      const purchase = await buy.post("/purchase", {
        network: config().network, blockchainIdentifier: job.blockchainIdentifier,
        agentIdentifier: env[agentName], inputHash, sellerVkey: payment.SmartContractWallet.walletVkey,
        identifierFromPurchaser: job.nonce, paymentSourceType: "Web3CardanoV2", supportedPaymentSourceIndex: 0,
        smartContractAddress: env.MASUMI_SMART_CONTRACT_ADDRESS, Amounts: funds,
        ...Object.fromEntries(Object.keys(deadlines).map((key) => {
          if (!/^\d+$/.test(payment[key] ?? "")) throw new Error(`Masumi payment response missing integer ${key}`);
          return [key, payment[key]];
        })),
        forceLayer: "L1", paymentForceLayer: payment.forceLayer ?? null,
      });
      return receipt(job, action, amount, buyer, seller, purchase);
    } catch (error) {
      return receipt(job, action, amount, buyer, seller, {}, error);
    }
  }
  function escrow(verdict, action) {
    const job = decode(verdict[`${action}EscrowId`]) ?? locks.get(`${verdict.supplier}:${action}`);
    if (!job?.blockchainIdentifier || job.supplier !== verdict.supplier || job.action !== action) {
      throw new Error(`Masumi ${action} escrow missing for ${verdict.supplier}`);
    }
    return job;
  }
  async function change(job, operation, resultHash, knownStatus) {
    // Reconcile before repeat calls, including across serverless invocations. Never blind-retry.
    const { side, queued } = OPERATIONS[operation];
    const current = knownStatus ?? await status(job, side);
    const submitted = current.resultHash || ["ResultSubmitted", "WithdrawAuthorized", "Withdrawn"].includes(current.onChainState);
    const refunded = ["RefundAuthorized", "RefundWithdrawn"].includes(current.onChainState);
    if ((operation === "submit-result" && submitted) || (operation === "authorize-refund" && refunded) ||
        (operation === "request-refund" && (refunded || current.onChainState === "RefundRequested")) ||
        queued.includes(current.NextAction?.requestedAction)) return current;
    if (operation === "submit-result" && current.onChainState !== "FundsLocked") return current;
    return client(side === "purchase" ? job.buyer : job.seller).post(
      `/${side}/${operation}`,
      { network: config().network, blockchainIdentifier: job.blockchainIdentifier,
        ...(operation === "submit-result" ? { submitResultHash: resultHash } : {}) },
    );
  }
  async function refundStep(job) {
    const [buyerStatus, sellerStatus] = await Promise.all([status(job, "purchase"), status(job)]);
    const refundQueued = OPERATIONS["authorize-refund"].queued.includes(sellerStatus.NextAction?.requestedAction);
    if (refundQueued || ["RefundAuthorized", "RefundWithdrawn"].includes(sellerStatus.onChainState)) return sellerStatus;
    if (["RefundRequested", "Disputed"].includes(sellerStatus.onChainState)) {
      return change(job, "authorize-refund", undefined, sellerStatus);
    }
    // The API accepts seller authorization only after the request is on chain.
    // Leave A2 automatic refund available if the seller never authorizes.
    const buyerQueued = OPERATIONS["request-refund"].queued.includes(buyerStatus.NextAction?.requestedAction);
    if (buyerQueued || buyerStatus.onChainState === "RefundRequested") {
      return { ...sellerStatus, onChainState: "RefundRequestedPending" };
    }
    if (buyerStatus.onChainState !== "FundsLocked") return sellerStatus;
    const requested = await change(job, "request-refund", undefined, buyerStatus);
    return { ...requested, onChainState: "RefundRequestedPending" };
  }
  async function transferStep(job, knownBondStatus) {
    const id = encode(job);
    if (transferResults.has(id)) return transferResults.get(id);
    const { bond, move, verdict } = job.followup;
    const current = knownBondStatus ?? await status(bond);
    if (current.onChainState !== "Withdrawn" || !treasury) return { onChainState: "TransferPending" };
    // The treasury persists/deduplicates this exact receipt id across invocations.
    const transfer = await treasury({ ...move, verdict, bondEscrowId: encode(bond), id });
    const data = transfer ? { onChainState: transfer.state, CurrentTransaction: { txHash: transfer.txHash } }
      : { onChainState: "TransferPending" };
    if (/^[0-9a-f]{64}$/i.test(transfer?.txHash ?? "")) transferResults.set(id, data);
    return data;
  }
  async function advance(id) {
    const job = decode(id);
    const followup = job?.followup;
    if (!followup || !(followup.operation === "transfer" ? followup.bond?.blockchainIdentifier : job.blockchainIdentifier)) return receipt(job ?? {}, "advance", 0, "", "", {}, new Error("Masumi follow-up receipt id required"));
    try {
      const data = followup.operation === "transfer" ? await transferStep(job)
        : followup.operation === "refund" ? await refundStep(job) : await change(job, "submit-result", followup.resultHash);
      return receipt(job, followup.action, followup.amount, followup.from, followup.to, data);
    } catch (error) { return receipt(job, followup.action, followup.amount, followup.from, followup.to, {}, error); }
  }
  return {
    badge: "PENDING",
    lockBidFee: (input) => simulatedAdapter.lockBidFee(input),
    lockAward: (input) => lock("award", input),
    lockBond: (input) => lock("bond", input),
    advance,
    async settle(verdict) {
      const moves = planSettlement(verdict);
      const resultHash = verdict.hash ?? hash(verdict);
      const results = [];
      // Award and bond progress independently; no chain-confirmation loops.
      const bondProgress = moves.some((move) => move.via === "plain_transfer")
        ? Promise.resolve().then(() => change(escrow(verdict, "bond"), "submit-result", resultHash)).then(
          (data) => ({ data }), (error) => ({ error }),
        ) : null;
      await Promise.all(moves.map(async (move, index) => {
        let job = { supplier: verdict.supplier, action: move.reason, verdictHash: resultHash };
        try {
          if (move.via === "plain_transfer") {
            const bond = escrow(verdict, "bond");
            job = { ...job, bondIdentifier: bond.blockchainIdentifier,
              followup: { operation: "transfer", action: move.reason, amount: move.amount,
                from: move.from, to: move.to, move, bond, verdict } };
            const { data, error } = await bondProgress;
            if (error) throw error;
            results[index] = receipt(job, move.reason, move.amount, move.from, move.to,
              await transferStep(job, data));
            return;
          }
          job = escrow(verdict, move.reason.startsWith("award") ? "award" : "bond");
          job = { ...job, followup: { action: move.reason, amount: move.amount, from: move.from, to: move.to,
            operation: move.reason === "award_release" ? "submit-result" : "refund", resultHash } };
          const data = move.reason === "award_release" ? await change(job, "submit-result", resultHash) : await refundStep(job);
          results[index] = receipt(job, move.reason, move.amount, move.from, move.to, data);
        } catch (error) { results[index] = receipt(job, move.reason, move.amount, move.from, move.to, {}, error); }
      }));
      return results;
    },
    async getEscrowStatus(id) {
      const job = decode(id);
      if (!job?.blockchainIdentifier) return simulatedAdapter.getEscrowStatus(id);
      try { const data = await status(job); return data.onChainState ?? data.NextAction?.requestedAction ?? "Pending"; }
      catch { return "Error"; }
    },
  };
}

export const realAdapter = createRealAdapter();
