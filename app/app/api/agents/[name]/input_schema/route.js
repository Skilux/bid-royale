import { getInputSchema } from "@/lib/masumi/agent-api";

export const dynamic = "force-dynamic";

/** MIP-003 `GET /input_schema`. */
export async function GET(_request, { params }) {
  const { name } = await params;
  return getInputSchema(name);
}
