import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Create a run and publish the tender. Body (optional): { brief?, seed? }. */
export async function POST(request) {
  const input = await request.json().catch(() => ({}));
  return respond(async () => ({ run: await getBoard().createRun(input) }), { status: 201 });
}
