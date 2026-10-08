import { getFlags } from "@/lib/config";
import { JudgeClient } from "./JudgeClient";

export const dynamic = "force-dynamic";

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The judge page: brief, Run, walkthrough with dashboard, receipt. ?run=<id> opens it attached to an existing run. */
export default async function Page({ searchParams }) {
  const { run } = await searchParams;
  const attachId = typeof run === "string" && RUN_ID.test(run) ? run : null;
  return <JudgeClient demoMode={getFlags().demoMode} attachId={attachId} />;
}
