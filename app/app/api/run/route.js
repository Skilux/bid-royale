import { liveGuardApplies, acquireLiveStart, findActiveRun } from "@/lib/board/live-guard";
import { getBoard, respond } from "@/lib/board/service";
import { createStoreFromEnv } from "@/lib/board";
import { getFlags, realPayments } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const guarded = () => liveGuardApplies({ realPayments: realPayments(), demoMode: getFlags().demoMode });

/** The live run still settling, if the guard applies: `{ guarded, active: { id, createdAt, status, ageMinutes } | null }`. Read only. */
export async function GET() {
  return respond(async () => (guarded() ? { guarded: true, active: await findActiveRun(createStoreFromEnv()) } : { guarded: false, active: null }));
}

/**
 * Create a run and publish the tender. Body (optional): { brief?, seed? }.
 * With real payments on a live Board, a second run while one is settling is a 409 `live_run_in_progress` with `activeRunId`.
 */
export async function POST(request) {
  const input = await request.json().catch(() => ({}));
  return respond(
    async () => {
      const release = guarded() ? await acquireLiveStart(createStoreFromEnv()) : null;
      try {
        return { run: await getBoard().createRun(input) };
      } catch (err) {
        await release?.();
        throw err;
      }
    },
    { status: 201 },
  );
}
