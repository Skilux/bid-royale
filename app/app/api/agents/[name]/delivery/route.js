import { handleDelivery } from "@/lib/delivery-report/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** A supplier agent posts its delivery report here, authenticated like /tender-invite. */
export async function POST(request, { params }) {
  const { name } = await params;
  return handleDelivery({ request, name });
}
