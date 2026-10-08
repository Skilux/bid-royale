import { z } from "zod";
import { PERSONAS, SUPPLIER_IDS } from "./personas.js";

/** The LLM's answer, the arguments of the `submit_bid` tool. On skip the agent repeats its last in-clamp quote. */
export const bidFor = (id) => {
  const c = PERSONAS[id].clamps;
  return z.object({
    decision: z.enum(["bid", "skip"]),
    price: z.number().min(c.price[0]).max(c.price[1]).multipleOf(5),
    impressions: z.number().int().min(c.impressions[0]).max(c.impressions[1]).multipleOf(100),
    promisedPer1000: z.number().int().min(c.promisedPer1000[0]).max(c.promisedPer1000[1]),
    rationale: z.string().min(1).max(280),
  });
};

export const QuoteArgs = z.object({
  price: z.number(),
  impressions: z.number(),
  promisedPer1000: z.number(),
});

export const InviteRequest = z.object({
  action: z.literal("bid").default("bid"),
  runId: z.string().max(100),
  supplier: z.enum(SUPPLIER_IDS),
  tender: z.object({
    budget: z.number(),
    gate: z.number(),
    bondRate: z.number(),
    bidFee: z.number(),
    currency: z.string().max(20),
    audience: z.string().max(200).optional(),
    deadline: z.number().optional(),
  }),
  reference: z
    .object({ pricePerSignup: z.number(), source: z.enum(["operator", "history"]) })
    .default({ pricePerSignup: 1, source: "operator" }),
  history: z
    .array(z.object({ supplier: z.string().max(50), kind: z.string().max(50), price: z.number(), promised: z.number(), delivered: z.number() }))
    .max(20)
    .default([]),
});

export const InviteResponse = z.object({
  supplier: z.string(),
  decision: z.enum(["bid", "skip"]),
  bid: z
    .object({
      supplier: z.string(),
      price: z.number(),
      impressions: z.number(),
      promisedPer1000: z.number(),
      salt: z.string(),
      commit: z.string(),
    })
    .optional(),
  rationale: z.string(),
  gate: z
    .object({ pricePerSignup: z.number(), winChance: z.number(), margin: z.number(), ev: z.number(), passed: z.boolean() })
    .optional(),
  source: z.enum(["llm", "pinned"]),
  reason: z.string().optional(),
  model: z.string().optional(),
  turns: z.number().optional(),
  usage: z.object({ calls: z.number(), tokens: z.number() }).optional(),
  attempts: z.array(z.object({ model: z.string(), reason: z.string(), status: z.number().optional(), error: z.string() })).optional(),
});
