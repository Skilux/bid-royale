import { handleRun } from "@/lib/supplier-agents/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tender invite on the registered `apiBaseUrl`. Same contract as `/run`. */
export async function POST(request, { params }) {
  const { name } = await params;
  return handleRun({ request, name });
}
