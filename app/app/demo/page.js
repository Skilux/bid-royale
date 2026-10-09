import { DEFAULT_RECORDING_ID, isRecordingId } from "@/lib/replay/catalog";
import { DemoClient } from "./DemoClient";

export const dynamic = "force-dynamic";

/**
 * The guided demo (DEMO mode, #66): the recorded run played chapter by chapter, with a camera that zooms in on the part
 * that matters, a caption for each phase and a script of who does what. ?replay=<id> picks the recording.
 */
export default async function Page({ searchParams }) {
  const { replay } = await searchParams;
  return <DemoClient replayId={typeof replay === "string" && isRecordingId(replay) ? replay : DEFAULT_RECORDING_ID} />;
}
