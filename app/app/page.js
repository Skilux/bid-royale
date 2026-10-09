import { getFlags, realPayments } from "@/lib/config";
import { isRecordingId } from "@/lib/replay/catalog";
import { JudgeClient } from "./JudgeClient";

export const dynamic = "force-dynamic";

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The judge page (#66): the run view on the default recording, paused. Play recording, Run live (asks first), the
 * dashboard, the balance widget and the receipt. ?run=<id> opens it attached to an existing run. ?replay=<id> opens it
 * on that recording, paused (see data/canned/index.js).
 */
export default async function Page({ searchParams }) {
  const { run, replay } = await searchParams;
  const attachId = typeof run === "string" && RUN_ID.test(run) ? run : null;
  const replayId = typeof replay === "string" && isRecordingId(replay) ? replay : null;
  return <JudgeClient demoMode={getFlags().demoMode} realPayments={realPayments()} attachId={attachId} replayId={replayId} />;
}
