import { availability } from "@/lib/masumi/agent-api";

export const dynamic = "force-dynamic";

/** MIP-003 `GET /availability` on the registered `apiBaseUrl`. */
export async function GET(_request, { params }) {
  const { name } = await params;
  return availability(name);
}
