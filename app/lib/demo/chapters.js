import { EVENTS } from "../board/events.js";
import { formatConversion } from "../conversion/index.js";

/**
 * The guided demo (DEMO mode, #66): the recorded run told in six timed sections that follow the 90 s transcript.
 * A chapter has a fixed length, a `schedule` of cursor jumps (how many events of the run are shown at which ms), camera
 * moves, script beats (one line of the script panel, spoken by a concrete actor) and stage overlays (cards, labels, the
 * three pillars). Everything is derived from the recording's events, so another recording gets its own numbers. Pure:
 * the UI owns timers and the camera.
 */

export const PILLARS = ["Competitive", "Guaranteed", "Traceable"];

/** Script actors. `tone` maps to a colour in the UI. */
export const ACTORS = {
  neo: { name: "NeoRack agent", initials: "NR", tone: "cobalt" },
  board: { name: "Tender Board", initials: "TB", tone: "ink" },
  escrow: { name: "Masumi escrow", initials: "ES", tone: "pass" },
  shop: { name: "NeoRack shop", initials: "SH", tone: "short" },
  verifier: { name: "Verifier", initials: "VR", tone: "ink" },
};

const VERDICT_ORDER = ["pass", "short_of_promise", "under_gate"];
const LOCK_PHASES = ["lock", "bid_fee"];

/**
 * The demo tells the story in its own order. Two changes, both pure reordering of recorded events:
 * 1. The Board signed the verdicts in another order. Each stands alone, so the demo swaps their places and tells Pass,
 *    Short of promise, Under gate.
 * 2. A lock or a bid fee shows PENDING while it waits for the chain, and turns REAL about two minutes later. The demo moves
 *    that confirmation next to the lock, so a card shows its link as the money goes in. The interim PENDING updates are
 *    dropped. It is a time cut, like the "13 min later" label, and the recording itself is untouched.
 * Every other event keeps its place.
 */
export function orderForDemo(events) {
  const at = events.flatMap((e, i) => (e.name === EVENTS.verdictSigned ? [i] : []));
  const sorted = at.map((i) => events[i]).sort((a, b) => VERDICT_ORDER.indexOf(a.data.kind) - VERDICT_ORDER.indexOf(b.data.kind));
  const swapped = events.slice();
  at.forEach((i, n) => {
    swapped[i] = sorted[n];
  });

  const created = new Set(swapped.filter((e) => (e.name === EVENTS.bidFeeLocked || e.name === EVENTS.escrowLocked) && e.data?.receipt?.id).map((e) => e.data.receipt.id));
  const lockProgress = (e) => e.name === EVENTS.settlementProgress && LOCK_PHASES.includes(e.data?.phase) && created.has(e.data?.receiptId);
  const confirms = new Map();
  for (const e of swapped) {
    if (lockProgress(e) && e.data.badge === "REAL" && !confirms.has(e.data.receiptId)) confirms.set(e.data.receiptId, e);
  }
  const hoisted = new Set(confirms.values());
  const out = [];
  for (const e of swapped) {
    if (lockProgress(e)) continue;
    out.push(e);
    const id = e.data?.receipt?.id;
    if ((e.name === EVENTS.bidFeeLocked || e.name === EVENTS.escrowLocked) && id && confirms.has(id)) out.push(confirms.get(id));
  }
  return hoisted.size ? out : swapped;
}

const index = (events, name, { nth = 1, where = () => true, from = 0 } = {}) => {
  let seen = 0;
  for (let i = from; i < events.length; i += 1) {
    if (events[i].name === name && where(events[i]) && (seen += 1) === nth) return i;
  }
  return -1;
};
const stepDone = (events, step) => index(events, EVENTS.stepCompleted, { where: (e) => e.data?.step === step });
const pct = (per1000) => formatConversion(per1000);
const money = (n) => String(Number(Number(n).toFixed(2)));
const after = (i) => (i >= 0 ? i + 1 : null);

const weight = (e) => (e.name === EVENTS.stepStarted || e.name === EVENTS.stepCompleted ? 0 : e.name === EVENTS.settlementProgress ? 0.25 : 1);

/**
 * Schedule entries { ms, cursor } that show events [from, to) one after another between startMs and endMs. The time is
 * shared by weight: step events are free, settlement progress is light. Every substantive event gets its own entry.
 */
export function walk(events, from, to, startMs, endMs) {
  if (from === null || to === null || to <= from) return [];
  const total = events.slice(from, to).reduce((t, e) => t + weight(e), 0) || 1;
  const out = [];
  let used = 0;
  for (let i = from; i < to; i += 1) {
    used += weight(events[i]);
    out.push({ ms: Math.round(startMs + (used / total) * (endMs - startMs)), cursor: i + 1 });
  }
  return out;
}

/**
 * The six sections. Each: { id, label, title, pillar, narration, durationMs, from, to, schedule, cams, beats, overlays }.
 * `from` and `to` are cursors. `cams` are { ms, keys }: camera target keys, see TARGETS in the UI ("supplier:<id>" frames one
 * seller). A beat fires at `ms` of the section, or `at` (a cursor) when the schedule reaches it. An overlay shows a card on
 * the stage at `ms` and goes away after `ttl` ms (never when `ttl` is missing, until the next section) or when a later
 * overlay lists its id in `clear`. Sections whose events are missing are cut down, never thrown.
 */
export function buildChapters(events) {
  const total = events.length;
  const tender = events.find((e) => e.name === EVENTS.tenderPublished)?.data;
  const names = Object.fromEntries((tender?.suppliers ?? []).map((s) => [s.id, s.name]));
  const nameOf = (id) => names[id] ?? id;
  const t = tender?.tender ?? { budget: 200, gate: 5, bondRate: 0.25, bidFee: 2, currency: "tADA" };
  const cur = t.currency ?? "tADA";

  const revealed = events.filter((e) => e.name === EVENTS.bidRevealed).map((e) => e.data);
  const verdicts = events.filter((e) => e.name === EVENTS.verdictSigned);
  const accepted = events.find((e) => e.name === EVENTS.allocationDecided)?.data?.accepted ?? [];
  const ranking = events.find((e) => e.name === EVENTS.auctionRanked)?.data?.ranking ?? [];
  const allocated = accepted.reduce((sum, a) => sum + (a.award ?? 0), 0);
  const verified = events.find((e) => e.name === EVENTS.verificationCompleted)?.data?.verified ?? {};
  const rejected = events.find((e) => e.name === EVENTS.bidRejected)?.data;
  const receipt = events.find((e) => e.name === EVENTS.receiptReady)?.data?.receipt;
  const bidOf = (id) => revealed.find((b) => b.supplier === id);

  const reclaim = index(events, EVENTS.settlementTransfer, { where: (e) => e.data?.receipt?.action === "award_reclaim" });
  const reclaimId = events[reclaim]?.data?.receipt?.id;
  const refundReal = reclaim < 0 ? -1 : events.findIndex((e, i) => i > reclaim && (e.data?.receiptId === reclaimId || e.data?.receipt?.id === reclaimId) && Boolean(e.data?.txHash ?? e.data?.receipt?.txHash));
  const refundAmount = events[reclaim]?.data?.receipt?.amount;

  const idx = (name, opts) => index(events, name, opts);
  const cursorOf = (name, opts) => after(idx(name, opts));
  const lockCursor = (supplier, kind) => cursorOf(EVENTS.escrowLocked, { where: (e) => e.data.supplier === supplier && e.data.kind === kind });
  const verdictCursor = (kind) => {
    const i = events.findIndex((e) => e.name === EVENTS.verdictSigned && e.data.kind === kind);
    return after(i);
  };
  const verdictOf = (kind) => verdicts.find((e) => e.data.kind === kind)?.data;

  const actorOf = (key) => {
    if (ACTORS[key]) return { actorName: ACTORS[key].name, initials: ACTORS[key].initials, tone: ACTORS[key].tone };
    const name = nameOf(key);
    const caps = name.match(/[A-Z]/g) ?? [];
    return { actorName: name, initials: (caps.length > 1 ? caps.slice(0, 2).join("") : name.slice(0, 2)).toUpperCase(), tone: "muted" };
  };

  const list = [];
  let cursor = 0;
  const add = (c) => {
    const schedule = (c.schedule ?? []).filter((s) => s.cursor !== null).sort((a, b) => a.ms - b.ms);
    const from = cursor;
    const to = schedule.length ? Math.max(from, schedule.at(-1).cursor) : from;
    const beats = (c.beats ?? []).filter((b) => b.ms !== undefined || (b.at !== null && b.at !== undefined)).map((b) => ({ ...b, ...actorOf(b.actor) }));
    list.push({ cams: [], overlays: [], ...c, from, to, schedule, beats });
    cursor = to;
  };

  // 0:00–0:12 What we built
  const tenderDone = cursorOf(EVENTS.stepCompleted, { where: (e) => e.data?.step === "tender" });
  add({
    id: "intro",
    label: "What we built",
    title: "What we built",
    pillar: null,
    narration: "We built an agentic economy that is competitive, guaranteed and traceable. Meet the Agentic Tender System: agents bid for a budget, and get paid only for verified results.",
    durationMs: 12000,
    schedule: walk(events, 0, tenderDone, 8400, 9000),
    cams: [
      { ms: 0, keys: ["all"] },
      { ms: 8300, keys: ["consumer"] },
    ],
    overlays: [
      { ms: 2900, id: "p1", kind: "pillar", text: PILLARS[0], slot: 0 },
      { ms: 3900, id: "p2", kind: "pillar", text: PILLARS[1], slot: 1 },
      { ms: 4900, id: "p3", kind: "pillar", text: PILLARS[2], slot: 2 },
      { ms: 6200, id: "title", kind: "title", text: "Agentic Tender System", clear: ["p1", "p2", "p3"], ttl: 2000 },
      {
        ms: 8700,
        id: "tender",
        kind: "card",
        title: "The tender",
        lines: [`budget  ${t.budget} ${cur}`, `gate    ${pct(t.gate)} conversion`, `bond    ${Math.round(t.bondRate * 100)}% of the award`],
      },
    ],
    beats: [
      {
        ms: 8700,
        actor: "neo",
        to: "Tender Board",
        text: `Publishing a tender. Budget ${t.budget} ${cur}, pay per verified signup.`,
        payload: [`gate  ${pct(t.gate)} conversion`, `bond  ${Math.round(t.bondRate * 100)}% of the award`, `fee   ${t.bidFee} ${cur} per bid`],
      },
    ],
  });

  // 0:12–0:20 The customer
  add({
    id: "customer",
    label: "The customer",
    title: "The customer",
    pillar: null,
    narration: "Here is one real run. NeoRack, a GPU cloud, wants ad signups and will pay only for verified ones.",
    durationMs: 8000,
    cams: [{ ms: 0, keys: ["consumer"] }],
    overlays: [{ ms: 500, id: "brief", kind: "typed", text: `Budget ${t.budget} ${cur}, ${tender?.brief?.audience ?? "technical users"}, ${tender?.brief?.goal ?? "pay per verified signup"}.`, ttl: 6800 }],
    beats: [{ ms: 1200, actor: "neo", to: "everyone", text: "I run a GPU cloud and I want ad signups. I pay only for the ones that are verified." }],
  });

  // 0:20–0:43 One: competitive
  const bidsDone = after(stepDone(events, "bids"));
  const allocDone = after(stepDone(events, "allocation"));
  const registry = cursorOf(EVENTS.registryDiscovered);
  const fee4 = after(idx(EVENTS.bidFeeLocked, { nth: 4 }) + 1); // the demo puts each fee's confirmation right after it
  const rejectedAt = cursorOf(EVENTS.bidRejected);
  const rankedAt = cursorOf(EVENTS.auctionRanked);
  const decidedAt = cursorOf(EVENTS.allocationDecided);
  const offers = ["techblog", "codepodcast", "devnewsletter", "gamingforum"].filter((id) => bidOf(id)).map((id) => `${nameOf(id)}  ${pct(bidOf(id).promisedPer1000)} for ${money(bidOf(id).price)}`);
  add({
    id: "competitive",
    label: "Competitive",
    title: "One: competitive",
    pillar: 0,
    narration:
      "One: competitive. NeoRack posts a tender on our Board and invites publisher agents from the Masumi registry. Each agent sets its own price and the conversion it promises. Every bid costs a small fee, which keeps bots out. GamingForum promises too little and is out. The best value per signup wins.",
    durationMs: 23000,
    schedule: [
      ...walk(events, cursor, registry, 3300, 3400),
      ...walk(events, registry, fee4, 5000, 8800),
      ...walk(events, fee4, bidsDone, 9200, 11600),
      ...walk(events, bidsDone, rejectedAt, 14600, 14800),
      ...walk(events, rejectedAt, rankedAt, 17200, 17400),
      ...walk(events, rankedAt, allocDone, 19200, 19800),
    ],
    cams: [
      { ms: 0, keys: ["suppliers"] },
      { ms: 17000, keys: ["suppliers", "consumer"] },
    ],
    overlays: [
      { ms: 11900, id: "offers", kind: "card", title: "The offers", lines: offers, ttl: 3600 },
      { ms: 12600, id: "fee", kind: "label", text: `bid fee ${t.bidFee} ${cur} each, REAL`, ttl: 3200 },
      {
        ms: 17500,
        id: "ranking",
        kind: "card",
        title: "Value per signup",
        lines: [...ranking.filter((r) => r.accepted).map((r) => `${nameOf(r.supplier).padEnd(13)} ${r.pricePerSignup.toFixed(2)}`), `budget  ${money(allocated)} of ${t.budget}`],
      },
    ],
    beats: [
      { at: registry, actor: "board", to: "Masumi registry", text: "Looking for seller agents in the registry. Found 4, and invited them all.", tag: "Discovery" },
      { at: cursorOf(EVENTS.bidCommitted, { nth: 4 }), actor: "board", to: "everyone", text: "All 4 sealed bids are in. Each one is only a hash of price, promise and a secret salt, so nobody can peek.", payload: ["commit = sha256(price, impressions,", "  promised rate, salt)"] },
      { at: fee4, actor: "escrow", to: "Tender Board", text: `Each bidder locked a ${t.bidFee} ${cur} bid fee. It keeps bots out.`, tag: "REAL tx" },
      { at: bidsDone, actor: "board", to: "everyone", text: "Reveal. Each seller shows its price and the conversion it promises, and I recompute every hash." },
      {
        at: rejectedAt,
        actor: "board",
        to: nameOf(rejected?.supplier),
        text: bidOf(rejected?.supplier) ? `${nameOf(rejected.supplier)} promises ${pct(bidOf(rejected.supplier).promisedPer1000)}. The gate is ${pct(t.gate)}. Out.` : `${nameOf(rejected?.supplier)} is out.`,
        tag: "Lost bid",
      },
      { at: rankedAt, actor: "board", to: "NeoRack agent", text: "Ranked by value per signup: price divided by promised signups, cheapest first." },
      { at: decidedAt, actor: "board", to: "NeoRack agent", text: `${accepted.length} winners. ${money(allocated)} of the ${t.budget} ${cur} budget is allocated.` },
    ],
  });

  // 0:43–0:59 Two: guaranteed
  const firstWinner = accepted[0]?.supplier;
  const locksDone = after(stepDone(events, "locks"));
  add({
    id: "guaranteed",
    label: "Guaranteed",
    title: "Two: guaranteed",
    pillar: 1,
    narration: "Two: guaranteed. Any agent can promise anything, so lying has to cost money. Every winner locks a bond of a quarter of its award in escrow, and gets it back only as far as it delivers.",
    durationMs: 16000,
    schedule: walk(events, cursor, locksDone, 6500, 13200),
    cams: [
      { ms: 0, keys: [`supplier:${firstWinner}`] },
      { ms: 5600, keys: ["consumer", "escrow"] },
      { ms: 9200, keys: ["escrow", "suppliers"] },
    ],
    overlays: [
      { ms: 600, id: "promise", kind: "card", title: `${nameOf(firstWinner)} promises ${pct(bidOf(firstWinner)?.promisedPer1000)}`, lines: ["The best offer on the table.", "Nothing stops it from lying."], ttl: 4800 },
      { ms: 13400, id: "locked", kind: "label", text: "6 of 6 locked, each a link to the explorer", ttl: 2400 },
    ],
    beats: [
      { ms: 900, actor: "board", to: "everyone", text: `${nameOf(firstWinner)} promises the most. Any agent can promise anything, so a promise has to cost money.` },
      { at: lockCursor(firstWinner, "award"), actor: "neo", to: "Masumi escrow", text: `Locking the award for ${nameOf(firstWinner)}: ${money(accepted[0]?.award)} ${cur}.`, tag: "REAL tx" },
      { at: lockCursor(firstWinner, "bond"), actor: firstWinner, to: "Masumi escrow", text: `Locking my bond: ${money(accepted[0]?.bond)} ${cur}, a quarter of my award. I get it back only as far as I deliver.`, tag: "REAL tx" },
      { at: cursorOf(EVENTS.escrowLocked, { nth: 6 }), actor: "escrow", to: "everyone", text: "6 of 6 locked: three awards from NeoRack and three bonds from the sellers.", tag: "REAL tx" },
    ],
  });

  // 0:59–1:21 Three: traceable
  const verificationDone = after(stepDone(events, "verification"));
  const verdictsDone = after(stepDone(events, "verdicts"));
  const passAt = verdictCursor("pass");
  const shortAt = verdictCursor("short_of_promise");
  const underAt = verdictCursor("under_gate");
  const settleStart = cursorOf(EVENTS.settlementStarted);
  const refundCursor = refundReal < 0 ? null : after(events[refundReal + 1] && (events[refundReal + 1].data?.receipt?.id === reclaimId || events[refundReal + 1].data?.receiptId === reclaimId) ? refundReal + 1 : refundReal);
  const cp = verdictOf("short_of_promise");
  const cpBond = accepted.find((a) => a.supplier === cp?.supplier)?.bond;
  const cpForfeit = events.find((e) => e.name === EVENTS.settlementTransfer && e.data?.supplier === cp?.supplier && e.data?.receipt?.action === "bond_forfeit")?.data?.receipt?.amount;
  const verdictBeat = (kind, text, tag = null) => {
    const d = verdictOf(kind);
    return d ? { at: verdictCursor(kind), actor: "board", to: nameOf(d.supplier), text: text(d, nameOf(d.supplier)), tag } : null;
  };
  const rate = (d) => `${pct(d.delivered)} against ${pct(d.promised)} promised`;
  add({
    id: "traceable",
    label: "Traceable",
    title: "Three: traceable",
    pillar: 2,
    narration:
      "Three: traceable. Every payment is a transaction on Cardano. The Board checks each signup against NeoRack's signed records. Beat your promise: paid in full, bond back. Fall short: paid, minus part of the bond. Fall under the gate: NeoRack gets its money back, plus your bond. Here is that refund.",
    durationMs: 22000,
    schedule: [
      ...walk(events, cursor, verificationDone, 1500, 5600),
      ...walk(events, verificationDone, passAt, 8000, 8200),
      ...(shortAt ? [{ ms: 11500, cursor: shortAt }] : []),
      ...(underAt ? [{ ms: 15000, cursor: underAt }] : []),
      ...walk(events, verdictsDone ?? underAt, refundCursor, 16200, 20300),
    ],
    cams: [
      { ms: 0, keys: ["suppliers"] },
      { ms: 15600, keys: ["consumer", "escrow"] },
    ],
    overlays: [
      { ms: 1500, id: "sim", kind: "label", text: "SIMULATED · shop traffic", ttl: 4600 },
      { ms: 6000, id: "later", kind: "label", text: "13 min later", big: true, ttl: 1500 },
      ...(cpForfeit && cpBond ? [{ ms: 11900, id: "forfeit", kind: "card", title: "Short of promise", lines: [`${money(cpForfeit)} of ${money(cpBond)} bond forfeited`], tone: "short", ttl: 3000 }] : []),
      ...(refundAmount ? [{ ms: 20400, id: "slip", kind: "card", title: "Refund slip", lines: [`${money(refundAmount)} back in my wallet`], tone: "under" }, { ms: 21000, id: "tx", kind: "tx" }] : []),
    ],
    beats: [
      { at: cursorOf(EVENTS.feedServed), actor: "shop", to: "Tender Board", text: "The campaign runs. The shop signs an event for every signup, with the seller it came from.", tag: "SIMULATED" },
      { at: verificationDone, actor: "verifier", to: "NeoRack agent", text: `Checked every signup against the signed records. Counted: ${Object.entries(verified).map(([id, n]) => `${nameOf(id)} ${n}`).join(", ") || "none"}.`, tag: "deterministic" },
      verdictBeat("pass", (d, who) => `${who} delivered ${rate(d)}. Pass: paid in full, bond back.`),
      verdictBeat("short_of_promise", (d, who) => `${who} delivered ${rate(d)}. Short of promise: paid, minus part of its bond.`),
      verdictBeat("under_gate", (d, who) => `${who} delivered ${d.delivered > 0 ? pct(d.delivered) : "nothing"} against ${pct(d.promised)} promised, under the ${pct(d.gate)} gate. NeoRack gets its money back.`, "refund path"),
      { at: settleStart, actor: "board", to: "Masumi escrow", text: "Settlement. I send my signed verdicts and escrow moves the money by them." },
      { at: refundCursor, actor: "escrow", to: "NeoRack agent", text: `Refund: ${money(refundAmount ?? 0)} ${cur} back to NeoRack.`, tag: "REAL tx" },
    ].filter(Boolean),
  });

  // 1:21–1:30 Close
  add({
    id: "close",
    label: "Close",
    title: "Pay for outcomes",
    pillar: null,
    narration: "NeoRack paid about 103 test ADA for 14 verified signups. The shop traffic is simulated. Every payment is real. Pay for outcomes, not impressions.",
    durationMs: 9000,
    schedule: [{ ms: 200, cursor: total }],
    cams: [{ ms: 0, keys: ["receipt"] }],
    overlays: [{ ms: 1500, id: "tally", kind: "tally" }],
    beats: [
      { ms: 900, actor: "neo", to: "everyone", text: receipt ? `I paid ${money(Math.abs(receipt.consumer.net))} ${cur} for ${receipt.consumer.signups} verified signups, about ${money(receipt.consumer.costPerSignup)} each.` : "I paid only for verified signups.", tag: "REAL tx" },
      { ms: 5200, actor: "neo", to: "everyone", text: "The shop traffic is simulated. Every payment is real. Pay for outcomes, not impressions." },
    ],
  });

  return list;
}

/** The cursor values and the ms they show at, merged with the beats that wait for a cursor. */
export const scheduleOf = (chapter) => chapter.schedule;

/** Beats of the chapters before `k`, in order: what the script panel already says when the demo jumps to chapter k. */
export function beatsBefore(chapters, k) {
  return chapters.slice(0, k).flatMap((c, i) => c.beats.map((b, j) => ({ ...b, id: `${i}:${j}`, chapter: i })));
}
