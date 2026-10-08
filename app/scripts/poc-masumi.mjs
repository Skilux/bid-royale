import { readFile } from "node:fs/promises";
import { installNextResolution } from "../lib/board/test-alias.js";
installNextResolution();
const { getAdapter } = await import("@/lib/masumi");
const { consumerNet } = await import("@/lib/settlement/plan");

// Keep the committed seed amounts; #24 owns the ×10 currency/amount migration.
const fixture = JSON.parse(await readFile(new URL("../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
const verdicts = ["techblog", "codepodcast", "devnewsletter"].map((supplier) => fixture.run.verdicts.find((verdict) => verdict.supplier === supplier));
const adapter = getAdapter();
const rows = [];
const jobs = await Promise.all(verdicts.map(async (verdict) => {
  const [award, bond] = await Promise.all([
    adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award }),
    adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond }),
  ]);
  return { verdict: { ...verdict, awardEscrowId: award.id, bondEscrowId: bond.id }, locks: [award, bond] };
}));
for (const job of jobs) rows.push(...job.locks);
const settled = await Promise.all(jobs.map(({ verdict }) => adapter.settle(verdict)));
rows.push(...settled.flat());
console.table(rows.map((row) => ({
  action: row.action, "from → to": `${row.from} → ${row.to}`, amount: row.amount,
  state: row.state, badge: row.badge, "tx hash": row.txHash ?? "—", "explorer link": row.explorerUrl ?? "—",
})));
console.log("consumerNet:", consumerNet(verdicts), adapter.badge);
for (const row of rows.filter((row) => row.error)) console.error(`${row.action}: ${row.error}`);
if (rows.some((row) => row.state === "Error")) process.exitCode = 1;
