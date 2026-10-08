import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";

/** Full run state: tender, bids, auction, feed, verification, verdicts, ledger, receipt. */
export async function GET(_request, { params }) {
  const { id } = await params;
  return respond(async () => ({ run: await getBoard().getRun(id) }));
}
