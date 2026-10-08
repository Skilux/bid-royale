import { startJob } from "@/lib/masumi/agent-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** MIP-003 `POST /start_job`: creates the payment terms with the agent's own Masumi key. */
export async function POST(request, { params }) {
  const { name } = await params;
  return startJob(name, request);
}
