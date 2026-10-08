import { BoardError, SSE_HEADERS, isStreamDone, streamEvents } from "@/lib/board";
import { getBoard, respond } from "@/lib/board/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/events?run=<id>[&after=<seq>]  Server-Sent Events for one run.
 * Resumes from the Last-Event-ID header (browsers send it on reconnect) or ?after.
 * 204 once the run finished and the client has seen every event, which stops EventSource reconnecting.
 * Add ?format=json to get { events, next, done } as plain JSON instead of a stream.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("run");
  if (!runId) return Response.json({ error: "missing_run", message: "pass ?run=<id>" }, { status: 400 });
  const after = Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const { store } = getBoard();

  if (url.searchParams.get("format") === "json") {
    return respond(async () => {
      if (!(await store.getRun(runId))) {
        throw new BoardError(404, "run_not_found", `no run ${runId}`);
      }
      const events = await store.getEvents(runId, after);
      const next = events.at(-1)?.seq ?? after;
      return { events, next, done: await isStreamDone({ store, runId, after: next }) };
    });
  }

  if (!(await store.getRun(runId))) {
    return Response.json({ error: "run_not_found", message: `no run ${runId}` }, { status: 404 });
  }
  if (await isStreamDone({ store, runId, after })) return new Response(null, { status: 204 });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const frame of streamEvents({ store, runId, after, signal: request.signal })) {
          controller.enqueue(encoder.encode(frame));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`event: stream.error\ndata: ${JSON.stringify({ message: err.message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: SSE_HEADERS });
}
