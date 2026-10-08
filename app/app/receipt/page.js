import fixture from "@/data/seeds/board-run.worked-example.json";
import { buildReceiptView } from "@/lib/receipt-view";
import { ReceiptClient } from "./ReceiptClient";

export const metadata = { title: "Receipt · Bid Royale" };

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function ReceiptPage({ searchParams }) {
  const { run } = await searchParams;
  const runId = typeof run === "string" && RUN_ID.test(run) ? run : null;
  const fixtureView = buildReceiptView({ ...fixture.run, events: fixture.events });
  return <ReceiptClient runId={runId} fixtureView={fixtureView} fixtureEvidence={fixture.evidence ?? []} />;
}
