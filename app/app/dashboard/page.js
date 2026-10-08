import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "Dashboard · Bid Royale" };

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** /dashboard plays the recorded run. ?run=<id> follows an existing run, ?mode=live starts a fresh one. */
export default async function DashboardPage({ searchParams }) {
  const { run, mode } = await searchParams;
  const runId = typeof run === "string" && RUN_ID.test(run) ? run : null;
  const initialMode = runId ? "attach" : mode === "live" ? "live" : "canned";
  return <DashboardClient initialMode={initialMode} runId={runId} />;
}
