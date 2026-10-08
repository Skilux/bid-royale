import { WORKED_EXAMPLE } from "../outcome-feed/index.js";

export const SUPPLIERS = [
  { id: "techblog", name: "TechBlog", persona: "conservative" },
  { id: "codepodcast", name: "CodePodcast", persona: "moderate" },
  { id: "devnewsletter", name: "DevNewsletter", persona: "aggressive over-promiser" },
  { id: "gamingforum", name: "GamingForum", persona: "passive low-baller" },
];

export const BRIEF = {
  advertiser: "NeoRack",
  audience: "technical users",
  goal: "pay per verified signup",
};

/** Pinned quotes that produce the worked example: three winners spending exactly the 200 budget. */
const PINNED = [
  { supplier: "techblog", price: 70, impressions: 1000, promisedPer1000: 7 },
  { supplier: "codepodcast", price: 60, impressions: 1000, promisedPer1000: 8 },
  { supplier: "devnewsletter", price: 70, impressions: 1500, promisedPer1000: 12 },
  { supplier: "gamingforum", price: 20, impressions: 1000, promisedPer1000: 4 },
];

/**
 * Default bid source. S11 supplier agents replace it: same signature, same output.
 * Output is the revealed bid. If `commit` and `committedAt` are present the Board keeps them,
 * otherwise it computes the commit and stamps the receive time.
 *
 * @returns {Promise<{supplier: string, price: number, impressions: number, promisedPer1000: number, salt: string, commit?: string, committedAt?: number}[]>}
 */
export async function pinnedBids() {
  return PINNED.map((b) => ({ ...b, salt: `salt-${b.supplier}` }));
}

/** Signups per 1,000 each supplier delivers in the scripted feed. Suppliers not listed deliver what they promised. */
export function scriptedDelivery(bid) {
  return WORKED_EXAMPLE.find((s) => s.id === bid.supplier)?.signupsPer1000 ?? bid.promisedPer1000;
}
