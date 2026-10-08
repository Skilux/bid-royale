import { handleRun } from "@/lib/supplier-agents/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Supplier agent brain: sealed quote for one supplier. Called by the Railway seller agent's /tender-invite. */
export async function POST(request, { params }) {
  const { name } = await params;
  return handleRun({ request, name });
}
