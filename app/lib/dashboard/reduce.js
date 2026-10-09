import { EVENTS } from "../board/events.js";
import { formatConversion } from "../conversion/index.js";

/**
 * Dashboard state = reduceEvents(Board SSE events so far). This file is the only place that maps Board event
 * names to UI state, so a renamed or new event (settlement.progress, #49) is a change here and nowhere else.
 * Pure and serialisable. Events are `{ seq, ts, name, data }`, the shape of GET /api/events and of the fixture.
 */

export const SEED_SUPPLIERS = [
  { id: "techblog", name: "TechBlog", persona: "conservative" },
  { id: "codepodcast", name: "CodePodcast", persona: "moderate" },
  { id: "devnewsletter", name: "DevNewsletter", persona: "aggressive over-promiser" },
  { id: "gamingforum", name: "GamingForum", persona: "passive low-baller" },
];

export const SEED_TENDER = { budget: 200, gate: 5, bondRate: 0.25, bidFee: 2, currency: "tADA", audience: "technical users" };

function newSupplier(s) {
  return {
    id: s.id,
    name: s.name ?? s.id,
    persona: s.persona ?? "",
    commit: null,
    bid: null,
    rejected: null,
    rank: null,
    pricePerSignup: null,
    award: 0,
    bond: 0,
    accepted: false,
    impressions: null,
    received: null,
    flagged: 0,
    verified: null,
    rejections: {},
    verdict: null,
  };
}

export function initialState({ replay = false } = {}) {
  return {
    runId: null,
    /** `run.created` badge: PENDING for the real adapter, SIMULATED for the simulated one, PRE-RECORDED in a replay. */
    runBadge: null,
    mode: replay ? "canned" : "live",
    replay,
    degraded: null,
    failed: null,
    done: false,
    tender: null,
    brief: null,
    /** Supplier discovery (#44): `registry.discovered` data, or null before it arrives. */
    discovery: null,
    order: [],
    suppliers: {},
    steps: {},
    ranking: [],
    totalAward: 0,
    feed: { done: false, window: null, signupsReceived: null },
    verification: { done: false },
    settlement: { status: "idle", job: null, fallback: null, late: false, pending: null },
    /** Every money row by receipt id, in first-seen order: bid fees, escrow locks, settlement transfers. */
    money: [],
    receipt: null,
    roundTwo: null,
    log: [],
    events: 0,
    lastSeq: 0,
  };
}

function supplierOf(state, id) {
  if (!id) return null;
  if (!state.suppliers[id]) {
    state.suppliers[id] = newSupplier({ id });
    state.order.push(id);
  }
  return state.suppliers[id];
}

/** Insert or update one money row by receipt id and phase. Later fields win, so PENDING turns REAL in place. */
function upsertMoney(state, phase, supplier, receipt) {
  if (!receipt?.id) return;
  const row = state.money.find((m) => m.id === receipt.id && m.supplier === supplier && m.phase === phase);
  const next = {
    id: receipt.id,
    phase,
    supplier,
    action: receipt.action,
    amount: receipt.amount,
    from: receipt.from,
    to: receipt.to,
    rawBadge: receipt.badge,
    state: receipt.state ?? null,
    topUp: receipt.topUp ?? 0,
    txHash: receipt.txHash ?? null,
    explorerUrl: receipt.explorerUrl ?? null,
    error: receipt.error ?? null,
    seq: state.events,
  };
  if (!row) state.money.push(next);
  else Object.assign(row, { ...next, amount: next.amount ?? row.amount, from: next.from ?? row.from, to: next.to ?? row.to, action: next.action ?? row.action, seq: row.seq });
}

/** Board ledger phases a `settlement.progress` update can target. Anything else is a settlement transfer. */
const PROGRESS_PHASES = ["lock", "bid_fee", "bid_fee_collect"];

function reset(state, keep) {
  const fresh = initialState({ replay: state.replay });
  Object.assign(state, fresh, keep);
}

function apply(state, e) {
  const d = e.data ?? {};
  const sup = supplierOf(state, d.supplier);

  switch (e.name) {
    case EVENTS.runCreated:
      state.runId = d.runId ?? state.runId;
      state.runBadge = d.badge ?? state.runBadge;
      if (d.mode === "canned") state.mode = "canned";
      break;
    case EVENTS.tenderPublished:
      state.tender = d.tender ?? state.tender;
      state.brief = d.brief ?? state.brief;
      for (const s of d.suppliers ?? []) {
        if (!state.suppliers[s.id]) {
          state.suppliers[s.id] = newSupplier(s);
          state.order.push(s.id);
        } else Object.assign(state.suppliers[s.id], { name: s.name ?? state.suppliers[s.id].name, persona: s.persona ?? "" });
      }
      break;
    case EVENTS.registryDiscovered:
      state.discovery = {
        source: d.source === "live" ? "live" : "seeded",
        label: d.label ?? (d.source === "live" ? "Masumi registry" : "seeded registry"),
        found: Array.isArray(d.agents) ? d.agents.length : 0,
        reason: d.reason ?? null,
        agents: d.agents ?? [],
      };
      break;
    case EVENTS.stepStarted:
      state.steps[d.step] = "running";
      break;
    case EVENTS.stepCompleted:
      state.steps[d.step] = "done";
      break;
    case EVENTS.stepFailed:
      state.steps[d.step] = "failed";
      break;
    case EVENTS.bidCommitted:
      sup.commit = d.commit;
      break;
    case EVENTS.bidFeeLocked:
      upsertMoney(state, "bid_fee", d.supplier, d.receipt);
      break;
    case EVENTS.bidRevealed:
      sup.bid = { price: d.price, impressions: d.impressions, promisedPer1000: d.promisedPer1000 };
      break;
    case EVENTS.bidRejected:
      sup.rejected = d.reason ?? "rejected";
      break;
    case EVENTS.auctionRanked:
      state.ranking = (d.ranking ?? []).map((r) => r.supplier);
      for (const [i, r] of (d.ranking ?? []).entries()) {
        const s = supplierOf(state, r.supplier);
        s.rank = i + 1;
        s.pricePerSignup = r.pricePerSignup ?? null;
      }
      break;
    case EVENTS.allocationDecided:
      state.totalAward = d.totalAward ?? (d.accepted ?? []).reduce((t, a) => t + (a.award ?? 0), 0);
      for (const a of d.accepted ?? []) Object.assign(supplierOf(state, a.supplier), { accepted: true, award: a.award, bond: a.bond });
      for (const r of d.rejected ?? []) supplierOf(state, r.supplier).rejected ??= r.reason;
      break;
    case EVENTS.escrowLocked:
      upsertMoney(state, "lock", d.supplier, { ...d.receipt, action: d.receipt?.action ?? d.kind });
      break;
    case EVENTS.feedServed:
      sup.impressions = d.impressions;
      sup.received = d.signupsReceived;
      sup.flagged = d.flaggedBySignals ?? 0;
      break;
    case EVENTS.feedGenerated:
      state.feed = { done: true, window: d.window ?? null, signupsReceived: d.signupsReceived ?? null };
      break;
    case EVENTS.verificationCompleted:
      state.verification = { done: true };
      for (const id of state.order) {
        const s = state.suppliers[id];
        if (s.impressions === null) continue;
        const per = (d.perSupplier ?? []).find((p) => p.supplier === id);
        s.verified = d.verified?.[id] ?? per?.verified ?? 0;
        s.rejections = per?.rejected ?? {};
      }
      break;
    case EVENTS.verdictSigned:
      sup.verdict = { kind: d.kind, delivered: d.delivered, promised: d.promised, gate: d.gate, award: d.award, bond: d.bond, hash: d.hash ?? null };
      break;
    case EVENTS.settlementStarted:
      state.settlement = { ...state.settlement, status: "running", job: d.job ?? null };
      break;
    case EVENTS.settlementTransfer:
      upsertMoney(state, "settlement", d.supplier, d.receipt);
      break;
    case EVENTS.settlementProgress: {
      const phase = PROGRESS_PHASES.includes(d.phase) ? d.phase : "settlement";
      upsertMoney(state, phase, d.supplier, {
        id: d.receiptId,
        action: d.action,
        badge: d.badge,
        state: d.state,
        txHash: d.txHash,
        explorerUrl: d.explorerUrl,
        error: d.error,
      });
      break;
    }
    case EVENTS.settlementCompleted:
      state.settlement = {
        ...state.settlement,
        status: "done",
        job: d.job ?? state.settlement.job,
        fallback: d.fallback ?? state.settlement.fallback,
        late: Boolean(d.late) || state.settlement.late,
        pending: d.pending ?? null,
      };
      break;
    case EVENTS.receiptReady:
      state.receipt = d.receipt ?? null;
      break;
    case EVENTS.roundTwoDecided:
      state.roundTwo = d.allocations ?? null;
      break;
    case EVENTS.runCompleted:
      state.done = true;
      break;
    case EVENTS.runFailed:
      state.failed = d.error ?? "run failed";
      break;
    case EVENTS.modeDegraded: {
      const info = { step: d.step ?? null, error: d.error ?? null };
      reset(state, { mode: "canned", degraded: info, runId: state.runId });
      break;
    }
    default:
      break;
  }
}

/** One log line per event, for the Board events panel. Null for events that carry nothing to read. */
export function describeEvent(state, e) {
  const d = e.data ?? {};
  const nm = (id) => state.suppliers[id]?.name ?? id;
  switch (e.name) {
    case EVENTS.runCreated:
      return "run created";
    case EVENTS.tenderPublished:
      return `tender published, gate ${formatConversion(d.tender?.gate)} conversion, bond ${Math.round((d.tender?.bondRate ?? 0) * 100)}%`;
    case EVENTS.registryDiscovered:
      return d.source === "live"
        ? `discovery: ${d.agents?.length ?? 0} supplier agents from the Masumi registry`
        : `discovery: seeded registry, ${d.agents?.length ?? 0} supplier agents (${String(d.reason ?? "").replaceAll("_", " ")})`;
    case EVENTS.bidCommitted:
      return `${nm(d.supplier)} sealed a bid ${shortHash(d.commit)}`;
    case EVENTS.bidFeeLocked:
      return `${nm(d.supplier)} paid the bid fee`;
    case EVENTS.bidRevealed:
      return `${nm(d.supplier)} revealed ${formatConversion(d.promisedPer1000)} conversion`;
    case EVENTS.bidRejected:
      return `${nm(d.supplier)} rejected: ${String(d.reason ?? "").replaceAll("_", " ")}`;
    case EVENTS.auctionRanked:
      return "ranked by price per promised signup";
    case EVENTS.allocationDecided:
      return `allocated ${d.accepted?.length ?? 0} of ${(d.accepted?.length ?? 0) + (d.rejected?.length ?? 0)} bids`;
    case EVENTS.escrowLocked:
      return `${nm(d.supplier)} ${d.kind} locked`;
    case EVENTS.feedServed:
      return `${nm(d.supplier)} served ${d.impressions?.toLocaleString("en-US")} impressions`;
    case EVENTS.feedGenerated:
      return "traffic window closed";
    case EVENTS.verificationCompleted:
      return "signups verified";
    case EVENTS.verdictSigned:
      return `${nm(d.supplier)} verdict signed, ${d.delivered} of ${d.promised}`;
    case EVENTS.settlementStarted:
      return "settlement started";
    case EVENTS.settlementTransfer:
      return `${nm(d.supplier)} ${String(d.receipt?.action ?? "transfer").replaceAll("_", " ")}`;
    case EVENTS.settlementProgress:
      return `${nm(d.supplier)} ${String(d.action ?? "row").replaceAll("_", " ")} ${String(d.state ?? "").toLowerCase()}`;
    case EVENTS.settlementCompleted:
      return d.fallback ? "settlement timed out, rows still pending" : "settlement complete";
    case EVENTS.receiptReady:
      return "receipt ready";
    case EVENTS.roundTwoDecided:
      return "round 2 decided, not executed";
    case EVENTS.runCompleted:
      return "run completed";
    case EVENTS.runFailed:
      return `run failed: ${d.error ?? "unknown"}`;
    case EVENTS.modeDegraded:
      return "live run failed, showing the recorded run";
    default:
      return null;
  }
}

export function shortHash(h) {
  return typeof h === "string" && h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : (h ?? "");
}

/** Fold events into a fresh state. `replay: true` marks a recorded transcript, so non-REAL money is PRE-RECORDED. */
export function reduceEvents(events, { replay = false } = {}) {
  const state = initialState({ replay });
  for (const e of events ?? []) {
    if (!e || typeof e.name !== "string") continue;
    state.events += 1;
    state.lastSeq = e.seq ?? state.lastSeq;
    apply(state, e);
    const text = describeEvent(state, e);
    if (text) state.log.push({ seq: e.seq ?? state.events, ts: e.ts ?? null, name: e.name, text, supplier: e.data?.supplier ?? null });
  }
  if (replay) state.mode = "canned";
  return state;
}
