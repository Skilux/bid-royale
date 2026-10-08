import { verifyVerdict } from "@/lib/verifier";
import { planSettlement } from "@/lib/settlement/plan";

export function authorizeTransfer({ verdict, move, boardPublicKey }) {
  try {
    if (!verifyVerdict(verdict, boardPublicKey)) return { authorized: false, reason: "InvalidVerdict" };
    const match = planSettlement(verdict).some((planned) => planned.via === "plain_transfer" &&
      ["reason", "from", "to", "amount"].every((field) => planned[field] === move?.[field]));
    return match ? { authorized: true } : { authorized: false, reason: "MoveNotInPlan" };
  } catch { return { authorized: false, reason: "InvalidVerdict" }; }
}

const pending = (error) => ({ state: "Pending", txHash: null, badge: "PENDING", explorerUrl: null, ...(error ? { error } : {}) });
const rejected = (reason) => ({ ...pending(), state: reason, error: reason });
const fingerprint = (verdict, move) => JSON.stringify([verdict.hash, move.reason, move.from, move.to, move.amount]);

/** Persist an irreversible reservation BEFORE POST: ambiguous failures require operator reconciliation. */
export async function executeTransfer({ id, verdict, move, boardPublicKey, store, client, fromAddress, addresses }) {
  const authorization = authorizeTransfer({ verdict, move, boardPublicKey });
  if (!authorization.authorized) return rejected(authorization.reason);
  if (typeof id !== "string" || !id || id.length > 16000) return rejected("InvalidId");
  const lovelace = Math.round(move.amount * 1e6);
  if (!Number.isSafeInteger(lovelace) || lovelace < 0) return rejected("InvalidAmount");
  if (lovelace < 2000000) return rejected("BelowMinimum");
  if (move.from !== "board" || !fromAddress || !addresses[move.to]) return rejected("MissingAddress");
  const binding = fingerprint(verdict, move);
  try {
    const existing = await store.getTransfer(id);
    if (existing) return existing.binding === binding ? getTransferStatus({ id, store, client }) : rejected("IdConflict");
    const record = { binding, ...pending() };
    if (!await store.reserveTransfer(id, record)) {
      const winner = await store.getTransfer(id);
      return winner?.binding === binding ? getTransferStatus({ id, store, client }) : rejected("IdConflict");
    }
    try {
      const data = await client.post("/wallet/transfer-funds", {
        fromWalletAddress: fromAddress, toAddress: addresses[move.to], lovelaceAmount: String(lovelace),
      });
      if (typeof data?.id !== "string" || !data.id) throw new Error("Missing transfer id; reconcile reservation before retry");
      await store.setTransfer(id, { ...record, transferId: data.id });
      return pending();
    } catch {
      // Never release this reservation: the node may already have accepted the transfer.
      const error = "Transfer submission uncertain; operator reconciliation required";
      await store.setTransfer(id, { ...record, error });
      return pending(error);
    }
  } catch { return pending("Treasury store unavailable; no automatic retry"); }
}

export async function getTransferStatus({ id, store, client }) {
  try {
    const record = await store.getTransfer(id);
    if (!record) return { ...pending(), state: "NotFound" };
    if (!record.transferId) return pending(record.error);
    const data = await client.request("/wallet/transfer-funds", { query: { id: record.transferId } });
    const transfer = data?.transfers?.[0];
    if (!transfer || typeof transfer.status !== "string") return pending("Missing transfer status");
    const txHash = /^[0-9a-f]{64}$/i.test(transfer.txHash ?? "") ? transfer.txHash : null;
    return { state: transfer.status, txHash, badge: txHash ? "REAL" : "PENDING",
      explorerUrl: txHash ? `https://preprod.cardanoscan.io/transaction/${txHash}` : null };
  } catch { return pending("Transfer status unavailable"); }
}
