import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { Money } from "./Money";

const BRIEF = { budget: 200, audience: "technical users", outcome: "verified signup", gate: 5, bondPercent: 25, currency: "tADA" };

function Agent({ name, role, children }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{role}</div>
      <h2 className="mt-1 font-display text-[24px] leading-none">{name}</h2>
      <p className="mt-2 text-[14px] text-ink-2">{children}</p>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[16px] font-medium">{children}</dd>
    </div>
  );
}

/** The brief a judge reads before pressing Run. Read-only for the demo. `quoteBadge` follows the chosen run mode. */
export function Brief({ quoteBadge }) {
  return (
    <div className="space-y-4" data-testid="brief">
      <div className="grid gap-3 sm:grid-cols-2">
        <Agent name="NeoRack" role="Consumer agent · buyer">
          I have a budget and want to buy ads from other agents. I pay only for signups the Board has verified.
        </Agent>
        <Agent name="Tender Board" role="Runs the tender, the auction and the verifier">
          I publish the tender, find sellers in the Masumi registry, rank sealed bids, lock escrow and sign a verdict per supplier.
        </Agent>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Field label="Budget">
          <Money amount={BRIEF.budget} badge={quoteBadge} currency={BRIEF.currency} />
        </Field>
        <Field label="Audience">{BRIEF.audience}</Field>
        <Field label="Outcome">{BRIEF.outcome}</Field>
        <Field label="Gate">{BRIEF.gate} per 1,000 impressions</Field>
        <Field label="Bond">{BRIEF.bondPercent}% of award</Field>
      </dl>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
        <Chip tone="cobalt">Discovery: Masumi registry</Chip>
        <Chip tone="cobalt">Wallet</Chip>
        <Chip tone="cobalt">Escrow: Masumi, Cardano preprod</Chip>
        <Chip tone="under">Dispute path: refund</Chip>
        <span className="ml-1">
          Amounts are tADA, the spec ×10. Quotes carry <Badge kind={quoteBadge} />
        </span>
      </div>
    </div>
  );
}
