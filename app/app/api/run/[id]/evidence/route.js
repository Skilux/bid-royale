import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";

/** Evidence manifest of a run: item names, hashes and byte sizes, plus one hash over the bundle. Read-only. */
export async function GET(_request, { params }) {
  const { id } = await params;
  return respond(async () => getBoard().evidenceManifest(id));
}
