/**
 * Persona seed config (docs/agents/personas.md). Costs are tUSDM per 1,000 impressions.
 * Prices are multiples of 0.5, impressions multiples of 100, promised per 1,000 integers.
 */
export const SUPPLIER_IDS = ["techblog", "codepodcast", "devnewsletter", "gamingforum"];

export const PERSONAS = {
  techblog: {
    id: "techblog",
    name: "TechBlog",
    style: "conservative",
    costPer1000: 5,
    minMargin: 0.5,
    clamps: { price: [5.5, 8], impressions: [500, 1500], promisedPer1000: [5, 8] },
    pinned: { price: 7, impressions: 1000, promisedPer1000: 7 },
    block:
      "You run TechBlog, a developer news site. Past campaigns converted at about 8 to 9 signups per 1,000 impressions. You promise below what you expect and price near cost plus a fair margin. You never chase the lowest price. A missed promise costs you more than a lost auction.",
  },
  codepodcast: {
    id: "codepodcast",
    name: "CodePodcast",
    style: "moderate",
    costPer1000: 4,
    minMargin: 0.5,
    clamps: { price: [4.5, 8], impressions: [500, 1500], promisedPer1000: [6, 10] },
    pinned: { price: 6, impressions: 1000, promisedPer1000: 8 },
    block:
      "You run CodePodcast, a developer audio show. Past campaigns converted at about 6 to 8 per 1,000. You stretch your promise a little to rank well and take a middling margin. You accept some risk of falling short.",
  },
  devnewsletter: {
    id: "devnewsletter",
    name: "DevNewsletter",
    style: "aggressive over-promiser",
    costPer1000: 3,
    minMargin: 0.5,
    clamps: { price: [5, 9], impressions: [1000, 2000], promisedPer1000: [10, 15] },
    pinned: { price: 7, impressions: 1500, promisedPer1000: 12 },
    block:
      "You run DevNewsletter, a developer email list. You believe your list converts at 12 or more per 1,000, from a past campaign with a different audience. You promise a lot to rank first and you take the largest slot you can. You treat the bond as a cost of winning.",
  },
  gamingforum: {
    id: "gamingforum",
    name: "GamingForum",
    style: "passive low-baller",
    costPer1000: 2,
    minMargin: 0.5,
    clamps: { price: [1, 4], impressions: [500, 1500], promisedPer1000: [2, 4] },
    pinned: { price: 3, impressions: 1000, promisedPer1000: 4 },
    block:
      "You run GamingForum, a gaming community. Your audience is not technical, you expect about 4 signups per 1,000. You bid low and small, only to see whether a slot is left over. You do not stretch your promise.",
  },
};

export const isSupplierId = (id) => Object.hasOwn(PERSONAS, id);
