import { after } from "next/server";
import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Start the settlement job. Returns { job } at once, the work finishes after the response. */
export async function POST(_request, { params }) {
  const { id } = await params;
  return respond(
    async () => {
      const { run, job, repeated } = await getBoard().startSettlement(id, { schedule: (fn) => after(fn) });
      return { step: "settlement", job, repeated, run };
    },
    { status: 202 },
  );
}

/**
 * Poll the job: /api/run/:id/settlement?job=<token>. Each poll runs one bounded reconcile tick (under 60 s), then
 * returns the job. Status is running, done or failed; phase is waiting_for_lock, settling, timer_fallback or settled.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const job = new URL(request.url).searchParams.get("job") ?? "";
  return respond(async () => getBoard().pollSettlement(id, job));
}
