import { BoardError } from "@/lib/board";
import { manifestEntry } from "@/lib/evidence";
import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";

/** One evidence item: the exact stored bytes next to their hash, so a reader can recompute it. Read-only. */
export async function GET(_request, { params }) {
  const { id, name } = await params;
  return respond(async () => {
    const item = await getBoard().evidenceItem(id, name);
    if (!item) throw new BoardError(404, "evidence_not_found", `no evidence item ${name} for run ${id}`);
    return { item: { ...manifestEntry(item), bytes: item.bytes } };
  });
}
