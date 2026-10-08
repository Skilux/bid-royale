import { eventPayload, shopKey, signText } from "../signing/index.js";

export const DEFAULT_WINDOW = { start: "2026-10-08T22:00:00.000Z", end: "2026-10-08T23:00:00.000Z" };

/** Scripted worked example. GamingForum is not served, so it has no entry. */
export const WORKED_EXAMPLE = [
  { id: "techblog", impressions: 1000, signupsPer1000: 8 },
  { id: "codepodcast", impressions: 1000, signupsPer1000: 6 },
  { id: "devnewsletter", impressions: 1500, signupsPer1000: 0 },
];

export const INVALID_KINDS = ["bad_signature", "wrong_attribution", "outside_window"];

export const sessionIdFor = (supplier, n) => `${supplier}.${String(n).padStart(4, "0")}`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {Object} SignupEvent
 * @property {string} eventId
 * @property {string} sessionId   "<supplier>.<n>", the click session the shop attributed to a supplier
 * @property {string} supplier
 * @property {string} ts          ISO timestamp
 * @property {string} signature   Ed25519 over eventPayload, hex, shop key
 * @property {{asn: string, clickBurst: boolean}} [signals]  dashboard context only, unsigned, never read by the verifier
 */

/**
 * Scripted, seeded feed. No live click path.
 * Valid signups per supplier = round(impressions / 1000 * signupsPer1000).
 * Unless includeInvalid is false, every served supplier also gets one event of each invalid kind.
 *
 * @returns {{ events: SignupEvent[], impressions: Record<string, number>, invalid: {eventId: string, supplier: string, kind: string}[] }}
 */
export function generateFeed({
  seed = 1,
  suppliers = WORKED_EXAMPLE,
  window = DEFAULT_WINDOW,
  includeInvalid = true,
  signingSecret,
} = {}) {
  const key = shopKey(signingSecret ?? process.env.SHOP_SIGNING_KEY);
  const rand = mulberry32(seed);
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const span = end - start;

  const events = [];
  const invalid = [];
  const impressions = {};
  let counter = 0;

  const make = (supplier, sessionId, ts, { tamper = false } = {}) => {
    const eventId = `evt_${String(++counter).padStart(5, "0")}`;
    const fields = { eventId, sessionId, supplier, ts: new Date(ts).toISOString() };
    const signature = signText(key, eventPayload(tamper ? { ...fields, eventId: `${eventId}x` } : fields));
    const flagged = rand() < 0.1;
    return { ...fields, signature, signals: { asn: flagged ? "AS16509" : "AS3320", clickBurst: flagged } };
  };
  const inWindow = () => start + Math.floor(rand() * span);

  for (const s of suppliers) {
    impressions[s.id] = s.impressions;
    const signups = Math.round((s.impressions / 1000) * s.signupsPer1000);
    for (let n = 1; n <= signups; n++) events.push(make(s.id, sessionIdFor(s.id, n), inWindow()));

    if (!includeInvalid) continue;
    const other = suppliers.find((o) => o.id !== s.id)?.id ?? "other";
    const bad = [
      ["bad_signature", make(s.id, sessionIdFor(s.id, 9001), inWindow(), { tamper: true })],
      ["wrong_attribution", make(s.id, sessionIdFor(other, 9002), inWindow())],
      ["outside_window", make(s.id, sessionIdFor(s.id, 9003), end + 3_600_000)],
    ];
    for (const [kind, event] of bad) {
      events.push(event);
      invalid.push({ eventId: event.eventId, supplier: s.id, kind });
    }
  }

  return { events, impressions, invalid };
}
