import { z } from "zod";

/**
 * The supplier delivery report, as agreed on #51. This file is the only place that knows the fields:
 * change the format here and nowhere else. Unknown fields are rejected, so the hash covers exactly these.
 */
export const MAX_SESSION_IDS = 2000;

const timestamp = z.iso.datetime({ offset: true });

export const DeliveryReport = z
  .object({
    supplier: z.string().regex(/^[a-z0-9-]{1,40}$/),
    runId: z.string().min(1).max(100),
    window: z.object({ from: timestamp, to: timestamp }).strict(),
    impressionsServed: z.number().int().min(0).max(10_000_000),
    sessionIds: z.array(z.string().min(1).max(64)).max(MAX_SESSION_IDS),
    servedAt: timestamp,
  })
  .strict()
  .refine((r) => Date.parse(r.window.from) < Date.parse(r.window.to), { message: "window.from must be before window.to", path: ["window"] });

/** @returns {{ok: true, report: object} | {ok: false, issues: string[]}} */
export function parseReport(body) {
  const parsed = DeliveryReport.safeParse(body);
  if (parsed.success) return { ok: true, report: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) };
}
