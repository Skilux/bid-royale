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
  "cancel-refund-request": { side: "purchase", queued: ["UnSetRefundRequestedRequested", "UnSetRefundRequestedInitiated"] },
};
// A lock is confirmed once the escrow holds the funds; later states mean it was locked first.
const LOCKED = ["FundsLocked", "ResultSubmitted", "RefundRequested", "Disputed", "WithdrawAuthorized", "RefundAuthorized",
  "Withdrawn", "RefundWithdrawn", "DisputedWithdrawn"];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const COMMIT = /^[0-9a-f]{64}$/;
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
  const goal = job.followup?.operation === "release" ? "Withdrawn"
    : job.followup?.operation === "refund" ? "RefundWithdrawn" : null;
  const candidate = !goal || data.onChainState === goal ? data.CurrentTransaction?.txHash : null;
  const txHash = /^[0-9a-f]{64}$/i.test(candidate ?? "") ? candidate : null;
  return {
    id: encode(job), badge: txHash ? "REAL" : "PENDING", action, amount, from, to,
    // The escrow this receipt drives, so callers never step one escrow twice at once.
    escrow: job.blockchainIdentifier ?? job.bondIdentifier ?? null,
    // A bid-fee lock carries the commit hash registered on Masumi; the reveal is checked against it.
    ...(job.inputHash && !job.followup ? { inputHash: job.inputHash } : {}),
    txHash, explorerUrl: txHash ? `https://preprod.cardanoscan.io/transaction/${txHash}` : null,
    state: error ? "Error" : data.onChainState ?? data.NextAction?.requestedAction ?? "Pending",
    ...(error || data.stepError ? { error: error?.message ?? data.stepError } : {}),
    // The treasury rounded a sub-minimum transfer up to the Cardano minimum; the Board paid this much extra (#62).
    ...(data.topUpLovelace > 0 ? { topUp: data.topUpLovelace / 1e6 } : {}),
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
  /** `commit` (bid fee only) becomes the escrow's inputHash; award and bond hash their own terms. */
  async function lock(action, { supplier, amount, commit }) {
    const seller = action === "award" ? supplier : "board";
    const buyer = action === "award" ? "consumer" : supplier;
    const job = { supplier, action, seller, buyer, amount, nonce: randomBytes(12).toString("hex") };
    if (action === "bid_fee") job.inputHash = typeof commit === "string" ? commit.toLowerCase() : commit;
    try {
      if (action === "bid_fee" && !COMMIT.test(job.inputHash ?? "")) throw new Error("Masumi bid fee needs the bid's commit hash (64 hex)");
      // Validate both parties before creating seller-side terms.
      const sell = client(seller);
      const buy = client(buyer);
      const agentName = `MASUMI_AGENT_${seller.toUpperCase()}`;
      if (!env[agentName]) throw new Error(`Masumi configuration missing ${agentName}`);
      const deadlines = paymentDeadlines({ now: now(), marginMs });
      const funds = [{ amount: lovelace(amount), unit: "" }];
      const inputHash = job.inputHash ?? hash({ action, supplier, amount, nonce: job.nonce });
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
      if (payment.inputHash !== undefined && payment.inputHash !== inputHash) {
        throw new Error("Masumi payment inputHash does not match the submitted hash");
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
  function escrowFor(verdict, action) {
    const job = decode(verdict[`${action}EscrowId`]) ?? locks.get(`${verdict.supplier}:${action}`);
    if (!job?.blockchainIdentifier || job.supplier !== verdict.supplier || job.action !== action) {
      throw new Error(`Masumi ${action} escrow missing for ${verdict.supplier}`);
    }
    return job;
  }
  async function escrowStep(job, path, resultHash, startOnly = false) {
    const [buyer, seller] = await Promise.all([status(job, "purchase"), status(job)]);
    const current = path === "refund" ? buyer : seller;
    if ([buyer, seller].some((side) => ["Withdrawn", "RefundWithdrawn", "DisputedWithdrawn", "FundsOrDatumInvalid"].includes(side.onChainState))) return current;
    // A side can lag the other; wait while either has queued work, then reconcile again.
    const queued = [buyer, seller].some((side) => Object.values(OPERATIONS)
      .some((operation) => operation.queued.includes(side.NextAction?.requestedAction)));
    if (queued) {
      return path === "refund" && OPERATIONS["request-refund"].queued.includes(buyer.NextAction?.requestedAction)
        ? { ...current, onChainState: "RefundRequestedPending" } : current;
    }
    const ready = (side, states) => side.NextAction?.requestedAction === "WaitingForExternalAction" && states.includes(side.onChainState);
    let operation;
    if (path === "release") {
      if (["WithdrawAuthorized", "RefundAuthorized", "RefundRequested"].includes(seller.onChainState)) return current;
      if (ready(buyer, ["Disputed"])) operation = "cancel-refund-request";
      else if (ready(buyer, ["ResultSubmitted"]) && seller.onChainState !== "Disputed") operation = "request-refund";
      else if (ready(seller, ["FundsLocked"]) && !seller.resultHash && (!buyer.onChainState || buyer.onChainState === "FundsLocked")) operation = "submit-result";
    } else {
      if ([buyer, seller].some((side) => side.onChainState === "RefundAuthorized")) return current;
      if (ready(seller, ["RefundRequested", "Disputed"])) operation = "authorize-refund";
      else if (ready(buyer, ["FundsLocked", "ResultSubmitted"]) && !["RefundRequested", "Disputed"].includes(seller.onChainState)) operation = "request-refund";
    }
    if (!operation || (startOnly && operation !== (path === "release" ? "submit-result" : "request-refund"))) return current;
    const { side } = OPERATIONS[operation];
    try {
      await client(side === "purchase" ? job.buyer : job.seller).post(`/${side}/${operation}`, {
        network: config().network, blockchainIdentifier: job.blockchainIdentifier,
        ...(operation === "submit-result" ? { submitResultHash: resultHash } : {}),
      });
      // The mutation response belongs to its caller; settlement evidence comes from the goal side.
      return path === "refund" && operation === "request-refund"
        ? { ...current, onChainState: "RefundRequestedPending" } : current;
    } catch (error) {
      // Cooperative rejection leaves timer-based collection available; later advances may retry.
      return { ...current, stepError: error.message };
    }
  }
  async function transferStep(job, knownBondStatus) {
    const id = encode(job);
    if (transferResults.has(id)) return transferResults.get(id);
    const { bond, move, verdict } = job.followup;
    const current = knownBondStatus ?? await escrowStep(bond, "release", job.followup.resultHash);
    if (current.onChainState !== "Withdrawn" || !treasury) return { onChainState: "TransferPending", ...(current.stepError ? { stepError: current.stepError } : {}) };
    // The treasury persists/deduplicates this exact receipt id across invocations.
    const transfer = await treasury({ ...move, verdict, bondEscrowId: encode(bond), id });
    const data = transfer ? { onChainState: transfer.state, CurrentTransaction: { txHash: transfer.txHash },
      ...(transfer.topUpLovelace > 0 ? { topUpLovelace: transfer.topUpLovelace } : {}) }
      : { onChainState: "TransferPending" };
    if (/^[0-9a-f]{64}$/i.test(transfer?.txHash ?? "")) transferResults.set(id, data);
    return data;
  }
  /** Lock confirmation: REAL with the lock transaction once the buyer side reports the funds locked. */
  async function lockStep(job) {
    const data = await status(job, "purchase");
    return LOCKED.includes(data.onChainState) ? data : { ...data, CurrentTransaction: null };
  }
  async function advance(id) {
    const job = decode(id);
    const followup = job?.followup;
    if (!followup && job?.blockchainIdentifier && ["award", "bond", "bid_fee"].includes(job.action)) {
      try { return receipt(job, job.action, job.amount, job.buyer, job.seller, await lockStep(job)); }
      catch (error) { return receipt(job, job.action, job.amount, job.buyer, job.seller, {}, error); }
    }
    if (!followup || !(followup.operation === "transfer" ? followup.bond?.blockchainIdentifier : job.blockchainIdentifier)) return receipt(job ?? {}, "advance", 0, "", "", {}, new Error("Masumi follow-up receipt id required"));
    try {
      const data = followup.operation === "transfer" ? await transferStep(job)
        : await escrowStep(job, followup.operation === "refund" ? "refund" : "release", followup.resultHash);
      return receipt(job, followup.action, followup.amount, followup.from, followup.to, data);
    } catch (error) { return receipt(job, followup.action, followup.amount, followup.from, followup.to, {}, error); }
  }
  return {
    badge: "PENDING",
    // MASUMI_BID_FEES=simulated is the fallback if bid-fee escrows stall: awards, bonds and the refund never wait on them.
    lockBidFee: (input) => env.MASUMI_BID_FEES === "simulated" ? simulatedAdapter.lockBidFee(input) : lock("bid_fee", input),
    lockAward: (input) => lock("award", input),
    lockBond: (input) => lock("bond", input),
    advance,
    /** The Board keeps every bid fee: Board submit-result, then the cooperative early release (like a forfeited bond). */
    async collectBidFee({ supplier, bidFeeEscrowId, resultHash }) {
      let job = decode(bidFeeEscrowId) ?? {};
      const amount = job.amount ?? 0;
      try {
        if (!job.blockchainIdentifier || job.action !== "bid_fee" || job.supplier !== supplier) {
          throw new Error(`Masumi bid_fee escrow missing for ${supplier}`);
        }
        if (!COMMIT.test(resultHash ?? "")) throw new Error("Masumi bid fee collection needs a result hash (64 hex)");
        job = { ...job, followup: { action: "bid_fee_collect", amount, from: supplier, to: "board", operation: "release", resultHash } };
        return receipt(job, "bid_fee_collect", amount, supplier, "board", await escrowStep(job, "release", resultHash, true));
      } catch (error) {
        return receipt(job, "bid_fee_collect", amount, supplier, "board", {}, error);
      }
    },
    async settle(input) {
      // Escrow ids only locate the locks and the delivery result hash (#51) is anchored on chain; the treasury gets the
      // signed verdict without them.
      const { awardEscrowId, bondEscrowId, resultHash: delivered, ...verdict } = input;
      const ids = { awardEscrowId, bondEscrowId };
      const escrow = (v, action) => escrowFor({ ...v, ...ids }, action);
      const moves = planSettlement(verdict);
      // Every submit-result carries sha256(delivery report + verdict hash) when the run has one, else the verdict hash.
      const resultHash = COMMIT.test(delivered ?? "") ? delivered : verdict.hash ?? hash(verdict);
      const results = [];
      // Award and bond progress independently; no chain-confirmation loops.
      const bondProgress = moves.some((move) => move.via === "plain_transfer")
        ? Promise.resolve().then(() => escrowStep(escrow(verdict, "bond"), "release", resultHash, true)).then(
          (data) => ({ data }), (error) => ({ error }),
        ) : null;
      await Promise.all(moves.map(async (move, index) => {
        let job = { supplier: verdict.supplier, action: move.reason, verdictHash: resultHash };
        try {
          if (move.via === "plain_transfer") {
            const bond = escrow(verdict, "bond");
            job = { ...job, bondIdentifier: bond.blockchainIdentifier,
              followup: { operation: "transfer", action: move.reason, amount: move.amount,
                from: move.from, to: move.to, move, bond, verdict, resultHash } };
            const { data, error } = await bondProgress;
            if (error) throw error;
            results[index] = receipt(job, move.reason, move.amount, move.from, move.to,
              await transferStep(job, data));
            return;
          }
          job = escrow(verdict, move.reason.startsWith("award") ? "award" : "bond");
          job = { ...job, followup: { action: move.reason, amount: move.amount, from: move.from, to: move.to,
            operation: move.reason === "award_release" ? "release" : "refund", resultHash } };
          const data = await escrowStep(job, job.followup.operation, resultHash, true);
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
