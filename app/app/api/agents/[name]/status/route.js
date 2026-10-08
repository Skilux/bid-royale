import { jobStatus } from "@/lib/masumi/agent-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** MIP-003 `GET /status?job_id=...`. */
export async function GET(request, { params }) {
  const { name } = await params;
  return jobStatus(name, new URL(request.url).searchParams.get("job_id"));
}
