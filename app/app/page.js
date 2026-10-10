import { getFlags, realPayments } from "@/lib/config";
import { isRecordingId } from "@/lib/replay/catalog";
import { JudgeClient } from "./JudgeClient";

export const dynamic = "force-dynamic";

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The judge page: the run view opens paused on the default recording. Play, Run live (asks first), step with the arrow keys.
 * ?run=<id> opens it attached to an existing run. ?replay=<id> opens it on that recording (see data/canned/index.js).
 * READ_ONLY=true hides Run live and the attach form; the API middleware rejects every write anyway.
 */
export default async function Page({ searchParams }) {
  const { run, replay } = await searchParams;
  const attachId = typeof run === "string" && RUN_ID.test(run) ? run : null;
  const replayId = typeof replay === "string" && isRecordingId(replay) ? replay : null;
  const flags = getFlags();
  return <JudgeClient demoMode={flags.demoMode} realPayments={realPayments()} readOnly={flags.readOnly} attachId={attachId} replayId={replayId} />;
}
