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

/** Poll the job: /api/run/:id/settlement?job=<token>. Status is running, done or failed. */
export async function GET(request, { params }) {
  const { id } = await params;
  const job = new URL(request.url).searchParams.get("job") ?? "";
  return respond(async () => getBoard().getSettlementJob(id, job));
}
