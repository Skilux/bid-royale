import { getFlags, realPayments } from "@/lib/config";
import { isRecordingId } from "@/lib/replay/catalog";
import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "Dashboard · Bid Royale" };

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * /dashboard plays a recording (the default, or ?replay=<id>, see data/canned/index.js).
 * ?run=<id> follows an existing run, ?mode=live asks to start a fresh one (the recording plays until you confirm).
 */
export default async function DashboardPage({ searchParams }) {
  const { run, mode, replay } = await searchParams;
  const runId = typeof run === "string" && RUN_ID.test(run) ? run : null;
  const flags = getFlags();
  const readOnly = flags.readOnly;
  const initialMode = readOnly ? "canned" : runId ? "attach" : mode === "live" ? "live" : "canned";
  const replayId = typeof replay === "string" && isRecordingId(replay) ? replay : null;
  return <DashboardClient initialMode={initialMode} runId={runId} replayId={replayId} demoMode={flags.demoMode} realPayments={realPayments()} readOnly={readOnly} />;
}
