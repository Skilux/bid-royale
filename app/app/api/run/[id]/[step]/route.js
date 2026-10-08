import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/run/:id/bids | allocation | locks | feed | verification | verdicts  run that step.
 * POST /api/run/:id/next  run whichever step is next.
 * POST /api/run/:id/all   run every remaining step and start settlement (it completes at once when simulated).
 * Settlement has its own route: /api/run/:id/settlement.
 */
export async function POST(_request, { params }) {
  const { id, step } = await params;
  const board = getBoard();
  return respond(async () => {
    // A real settlement takes ~20 min: return after its first tick; the settlement poll and the tick route finish it.
    if (step === "all") return { run: await board.runAll(id, { waitForSettlement: false }) };
    const out = step === "next" ? await board.nextStep(id) : await board.runStep(id, step);
    return { step, ...out };
  });
}
