import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One reconcile tick for every run with settlement work left (at most 3). The Railway trigger calls this every
 * ~30 s, so a real settlement finishes with no browser open. Public on purpose: a tick only fires escrow steps the
 * chain state already allows, and each run's tick is claimed, so repeat calls are no-ops.
 */
async function tick() {
  return respond(async () => ({ runs: await getBoard().reconcileActive() }));
}

export const GET = tick;
export const POST = tick;
