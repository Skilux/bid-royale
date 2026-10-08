"use client";

import { motion as Motion, useReducedMotion } from "motion/react";
import { shortHash } from "@/lib/dashboard/reduce";
import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { Counter } from "./Counter";
import { formatAmount } from "./format";
import { Money } from "./Money";
import { VerdictChip } from "./VerdictChip";

const OUTCOME_TONE = {
  award_release: "text-pass",
  bond_return: "text-pass",
  award_reclaim: "text-under",
  bond_forfeit: "text-under",
};

const CARD_TONE = {
  pass: "border-pass",
  short_of_promise: "border-short",
  under_gate: "border-under shadow-[0_0_0_1px_var(--color-under),0_0_28px_var(--color-under-bg)]",
  escrowed: "border-cobalt",
  lost_bid: "border-line opacity-60",
};

const CELL_TONE = {
  wait: "border-dashed border-line text-ink-3",
  locked: "border-cobalt bg-card",
  paid: "border-pass bg-pass-bg",
  refund: "border-under bg-under-bg",
  pending: "border-dotted border-ink-3 bg-wash text-ink-2",
};

const txOf = (m) => (m?.explorerUrl ? { hash: m.txHash, url: m.explorerUrl } : null);

function Label({ children, className = "" }) {
  return <div className={`font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ${className}`}>{children}</div>;
}

function Panel({ children, className = "", ...rest }) {
  return (
    <section className={`rounded-xl border border-line bg-card p-3.5 ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** The embeddable dashboard. Draws a `buildDashboardView` result and nothing else. */
export function Dashboard({ view }) {
  const quoteBadge = view.mode === "canned" ? "PRE-RECORDED" : "SIMULATED";
  return (
    <div className="space-y-3" data-testid="dashboard">
      <StepBar view={view} />
      {view.degraded ? (
        <div className="rounded-lg border border-dashed border-short bg-short-bg px-3 py-2 text-[13px]" data-testid="degraded">
          The live run failed{view.degraded.step ? ` at ${view.degraded.step}` : ""}. Showing the recorded run instead, badged <Badge kind="PRE-RECORDED" />.
        </div>
      ) : null}
      {view.failed ? <div className="rounded-lg border border-under bg-under-bg px-3 py-2 text-[13px]">Run failed: {String(view.failed)}</div> : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <TenderCard view={view} quoteBadge={quoteBadge} />
        <EscrowPanel view={view} />
        <div className="space-y-2.5" data-testid="suppliers">
          <Label>Suppliers · found in the Masumi registry</Label>
          {view.suppliers.length === 0 ? <EmptyNote>Waiting for the tender…</EmptyNote> : null}
          {view.suppliers.map((s) => (
            <SupplierCard key={s.id} s={s} view={view} quoteBadge={quoteBadge} />
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <BotPanel view={view} />
        <EventsPanel view={view} />
        <TrackFit view={view} quoteBadge={quoteBadge} />
      </div>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-ink-3">{children}</p>;
}

function StepBar({ view }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto font-mono text-[10px] uppercase tracking-[0.12em]" aria-label="Run steps">
      {view.steps.map((s, i) => (
        <li key={s.key} data-step={s.key} data-status={s.status} className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
          <i
            className={`size-2.5 shrink-0 rounded-full border ${
              s.status === "done" ? "border-cobalt bg-cobalt" : s.status === "running" ? "border-cobalt bg-card ring-4 ring-cobalt/20" : s.status === "failed" ? "border-under bg-under" : "border-line bg-card"
            }`}
          />
          <span className={s.status === "pending" ? "text-ink-3" : s.status === "running" ? "text-cobalt" : "text-ink-2"}>{s.label}</span>
          {i < view.steps.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
        </li>
      ))}
    </ol>
  );
}

function TenderCard({ view, quoteBadge }) {
  const { tender, wallet, budget } = view;
  const reduced = useReducedMotion();
  const hero = view.hero;
  const sup = (id) => view.suppliers.find((s) => s.id === id);
  return (
    <Panel className={`relative ${hero ? "border-under shadow-[0_0_0_1px_var(--color-under),0_0_36px_var(--color-under-bg)]" : ""}`} data-testid="tender-card">
      <Label>NeoRack · consumer agent</Label>
      <p className="mt-1.5 font-display text-[19px] leading-tight">
        {view.started ? (
          <>
            Budget <Money amount={tender.budget} badge={quoteBadge} currency={view.currency} />, {view.brief.audience}, {view.brief.goal}.
          </>
        ) : (
          "Waiting for the brief…"
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
        <Chip tone="neutral">
          gate <b>{tender.gate}</b> per 1,000
        </Chip>
        <Chip tone="neutral">
          bond <b>{Math.round(tender.bondRate * 100)}%</b>
        </Chip>
        <Chip tone="neutral">
          bid fee <Money amount={tender.bidFee} badge={quoteBadge} />
        </Chip>
        {view.discovery ? (
          <Chip tone={view.discovery.source === "live" ? "cobalt" : "neutral"}>
            <span data-testid="discovery-chip" title={view.discovery.agents.map((a) => `${a.name} ${a.apiBaseUrl}`).join("\n")}>
              {view.discovery.chip}
            </span>
          </Chip>
        ) : null}
      </div>

      <Label className="mt-4">Budget allocated · ranked by price per promised signup</Label>
      <div className="mt-1 flex items-baseline gap-1.5 text-[13px]" data-testid="budget">
        <Money amount={budget.allocated} badge={quoteBadge} /> of <Money amount={budget.total} badge={quoteBadge} currency={view.currency} />
      </div>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-wash" role="img" aria-label="Budget allocated per supplier">
        {budget.segments.map((seg, i) => (
          <Motion.i
            key={seg.id}
            title={seg.name}
            initial={reduced ? false : { width: 0 }}
            animate={{ width: `${(seg.award / budget.total) * 100}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`block h-full border-r-2 border-card ${["bg-cobalt", "bg-pass", "bg-short", "bg-ink-2"][i % 4]}`}
          />
        ))}
      </div>
      {view.suppliers.some((s) => s.rank) ? (
        <ol className="mt-2 space-y-0.5 text-[12px] text-ink-2" data-testid="ranking">
          {view.suppliers
            .filter((s) => s.rank)
            .sort((a, b) => a.rank - b.rank)
            .map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {s.rank}. {s.name}
                </span>
                <span className="tabular-nums">
                  {s.pricePerSignup === null ? "·" : <Money amount={Number(s.pricePerSignup.toFixed(2))} badge={quoteBadge} />} per promised signup
                </span>
              </li>
            ))}
        </ol>
      ) : null}

      <Label className="mt-4">Wallet · net</Label>
      <div className="font-display text-[44px] leading-none tabular-nums" data-testid="wallet-net">
        <Money amount={wallet.net} badges={[...new Set([...wallet.badgesOut, ...wallet.badgesBack])]} currency={view.currency} />
      </div>
      <dl className="mt-2 text-[12px]">
        <Line label="escrowed" value={<Money amount={wallet.escrowed} badges={wallet.badgesOut.length ? wallet.badgesOut : [quoteBadge]} />} />
        <Line label="back" value={<Money amount={wallet.back} badges={wallet.badgesBack.length ? wallet.badgesBack : [quoteBadge]} />} />
        {wallet.pendingOut > 0 ? <Line label="locking, not moved yet" value={<Money amount={wallet.pendingOut} badge="PENDING" />} /> : null}
        {wallet.pendingBack > 0 ? <Line label="returning, not moved yet" value={<Money amount={wallet.pendingBack} badge="PENDING" />} /> : null}
        <Line label="bid fees paid by suppliers" value={<Money amount={view.bidFees.total} badges={view.bidFees.badges.length ? view.bidFees.badges : [quoteBadge]} />} />
      </dl>
      {hero ? (
        <Motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.9, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          className="mt-3 rounded-lg bg-under px-3 py-2 text-white"
          data-testid="refund-stamp"
        >
          <div className="font-display text-[20px] uppercase leading-none tracking-[0.06em]">Under gate refund</div>
          <div className="mt-1 text-[13px]">
            {hero.name}: <Money amount={hero.amount} badge={hero.badge} sign="+" className="font-bold" tx={txOf(hero)} /> back to NeoRack
          </div>
          {sup(hero.supplier)?.verdict ? (
            <div className="text-[11px] opacity-90">
              promised {sup(hero.supplier).verdict.promised} per 1,000, delivered {sup(hero.supplier).verdict.delivered}
            </div>
          ) : null}
        </Motion.div>
      ) : null}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">money is released only on a signed verdict</p>
    </Panel>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line py-[3px] text-ink-2">
      <dt>{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function EscrowPanel({ view }) {
  const { escrow } = view;
  return (
    <Panel data-testid="escrow-panel">
      <Label>Escrow · Masumi on Cardano preprod</Label>
      <div className="mt-1 font-mono text-[13px] font-semibold" data-testid="escrow-total">
        locked <Money amount={escrow.locked} badges={escrow.badges.length ? escrow.badges : [view.mode === "canned" ? "PRE-RECORDED" : "SIMULATED"]} /> of {formatAmount(escrow.total)} {view.currency}
        {escrow.pending > 0 ? (
          <span className="ml-2 text-ink-3">
            <Money amount={escrow.pending} badge="PENDING" /> waiting for lock
          </span>
        ) : null}
      </div>
      <div className="mt-2 divide-y divide-line">
        {view.suppliers.map((s) => (
          <div key={s.id} className={`py-2 ${s.lost ? "opacity-45" : ""}`} data-escrow={s.id}>
            <div className="font-display text-[14px] uppercase tracking-[0.05em]">{s.name}</div>
            {s.lost ? (
              <div className="mt-1 text-[12px] text-ink-3">no escrow</div>
            ) : (
              <div className="mt-1 space-y-1.5">
                {s.cells.map((cell) => (
                  <EscrowCell key={cell.kind} title={cell.kind} cell={cell} />
                ))}
              </div>
            )}
          </div>
        ))}
        {view.suppliers.length === 0 ? <EmptyNote>Nothing locked yet.</EmptyNote> : null}
      </div>
    </Panel>
  );
}

function EscrowCell({ title, cell }) {
  if (!cell) return null;
  const { lock, outcomes, tone } = cell;
  return (
    <div className={`rounded-md border px-2 py-1 text-[12px] ${CELL_TONE[tone]}`} data-cell={title} data-tone={tone}>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{title}</span>
        {lock ? <Money amount={lock.amount} badge={lock.badge} tx={txOf(lock)} /> : <span className="text-ink-3">not locked yet</span>}
      </div>
      {lock?.pending ? <div className="text-[11px] italic text-ink-3">submitted, waiting for the chain. Not moved yet.</div> : null}
      {outcomes.map((o) => (
        <Motion.div
          key={o.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-0.5 flex flex-wrap items-center justify-between gap-x-2 border-t border-dashed border-line pt-0.5 ${o.pending ? "text-ink-3" : (OUTCOME_TONE[o.action] ?? "")}`}
        >
          <span>
            {o.pending ? "pending: " : ""}
            {o.label}
          </span>
          <Money amount={o.amount} badge={o.badge} tx={txOf(o)} />
        </Motion.div>
      ))}
    </div>
  );
}

function SupplierCard({ s, view, quoteBadge }) {
  const tone = s.chip ? CARD_TONE[s.chip.kind] : "border-line";
  const gatePct = Math.min(100, (view.gate / view.scaleMax) * 100);
  const promisedPct = s.promised ? Math.min(100, (s.promised / view.scaleMax) * 100) : null;
  const fillPct = Math.min(100, (s.per1000 / view.scaleMax) * 100);
  return (
    <section className={`rounded-xl border bg-card p-3 transition-colors duration-700 ${tone}`} data-supplier={s.id} data-verdict={s.chip?.kind ?? "none"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={`font-display text-[19px] uppercase leading-none tracking-[0.03em] ${s.lost ? "text-ink-3 line-through" : ""}`}>{s.name}</h3>
          <div className="mt-0.5 text-[11px] text-ink-3">{s.persona}</div>
        </div>
        {s.chip ? <VerdictChip kind={s.chip.kind} label={s.chip.label} /> : null}
      </div>
      <div className="mt-1.5 min-h-[18px] text-[12px] text-ink-2">
        {s.rejectedNote ? (
          <span>{s.rejectedNote}</span>
        ) : s.bid ? (
          <span>
            <Money amount={s.bid.price} badge={quoteBadge} /> for {s.bid.impressions.toLocaleString("en-US")} impr. · promises <b>{s.bid.promisedPer1000}</b> per 1,000
            {s.pricePerSignup !== null ? <> · {s.pricePerSignup.toFixed(2)} per promised signup</> : null}
          </span>
        ) : s.commit ? (
          <span className="font-mono text-[11px]" title={s.commit}>
            sealed {shortHash(s.commit)}
          </span>
        ) : (
          <span className="text-ink-3">invited</span>
        )}
      </div>
      {s.bid && s.commit ? (
        <div className="font-mono text-[10px] text-ink-3" title={s.commit}>
          commit {shortHash(s.commit)} · revealed
        </div>
      ) : null}
      {s.lost ? null : (
        <>
          <div className="relative mt-3 h-2.5 rounded bg-wash" aria-hidden="true">
            <div className={`h-full rounded-l transition-[width] duration-700 ${s.verifiedKnown ? "bg-pass" : "bg-ink-3"}`} style={{ width: `${fillPct}%` }} />
            <u className="absolute -bottom-1 -top-1 w-0.5 bg-under no-underline" style={{ left: `${gatePct}%` }}>
              <span className="absolute left-[-14px] top-[16px] whitespace-nowrap font-mono text-[9px] text-under">gate {view.gate}</span>
            </u>
            {promisedPct !== null ? (
              <u className="absolute -bottom-1 -top-1 w-0.5 bg-cobalt no-underline" style={{ left: `${promisedPct}%` }}>
                <span className="absolute left-[-20px] top-[-14px] whitespace-nowrap font-mono text-[9px] text-cobalt">promised {s.promised}</span>
              </u>
            ) : null}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <b className="font-display text-[28px] leading-none" data-testid={`count-${s.id}`}>
              <Counter to={s.served ? s.count : 0} />
            </b>
            <span className="text-[12px] text-ink-2" data-testid={`count-label-${s.id}`}>
              {s.verifiedKnown ? "verified signups" : s.served ? "signups received, not verified yet" : "verified signups"}
            </span>
            {s.served ? (
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                <Counter to={s.impressionsTarget} /> impr.
              </span>
            ) : null}
          </div>
          {s.verifiedKnown && s.delivered !== null ? (
            <div className="mt-1 text-[11px] text-ink-3" data-testid={`rejections-${s.id}`}>
              {Object.keys(s.rejections).length
                ? `rejected: ${Object.entries(s.rejections)
                    .map(([k, n]) => `${n} ${k.replaceAll("_", " ")}`)
                    .join(", ")}`
                : "no rejected signups"}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function BotPanel({ view }) {
  return (
    <Panel data-testid="bot-panel">
      <Label>Bot signals · context only, never the verdict</Label>
      <div className="mt-1.5 divide-y divide-line text-[12px]">
        {view.bots.length === 0 ? <div className="py-2 text-ink-3">No traffic yet.</div> : null}
        {view.bots.map((b) => (
          <div key={b.id} className="py-1.5">
            <div className="flex justify-between gap-2">
              <b>{b.name}</b>
              <span className="text-ink-2">{!b.served ? "·" : b.received ? `${b.received} received` : "no signups"}</span>
            </div>
            {b.served ? (
              <div className={b.flaggedBySignals || b.detail?.clickBursts ? "text-short" : "text-ink-3"}>
                {b.flaggedBySignals || b.detail?.clickBursts ? `${b.flaggedBySignals || b.detail.clickBursts} flagged` : "0 flagged"}
                {b.detail?.clickBursts ? ", click burst" : ""}
                {b.detail?.asns?.length ? ` · ASN ${b.detail.asns.map((a) => `${a.asn} ×${a.count}`).join(", ")}` : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EventsPanel({ view }) {
  return (
    <Panel data-testid="events-panel">
      <Label>Board events · SSE</Label>
      <ul className="mt-1.5 text-[12px]">
        {view.log.length === 0 ? <li className="py-2 text-ink-3">No events yet.</li> : null}
        {view.log.map((l, i) => (
          <li key={`${l.seq}-${l.name}-${i}`} className={`flex gap-2 border-t border-line py-[3px] ${i === 0 ? "text-ink" : "text-ink-2"}`}>
            <em className="min-w-[132px] shrink-0 font-mono text-[10px] not-italic text-ink-3">{l.name}</em>
            <span className="truncate">{l.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TrackFit({ view, quoteBadge }) {
  const r = view.receipt;
  return (
    <Panel data-testid="track-fit">
      <Label>Track fit</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Lit on={view.chips.discovery}>Discovery: Masumi registry</Lit>
        <Lit on={view.chips.wallet}>Wallet</Lit>
        <Lit on={view.chips.masumi}>Escrow: Masumi, Cardano preprod</Lit>
        <Lit on={view.chips.dispute} tone="under">
          Dispute path: refund
        </Lit>
      </div>
      <div className={`mt-3 ${r ? "" : "opacity-25"}`} data-testid="mini-receipt">
        <div className="font-display text-[30px] leading-none tabular-nums text-cobalt">
          {r ? <Money amount={r.net} badges={r.badges.length ? r.badges : [quoteBadge]} currency={view.currency} /> : "·"}
        </div>
        {r ? (
          <div className="mt-1 text-[12px] text-ink-2">
            <b>{r.signups}</b> verified signups · <b>{r.costPerSignup === null ? "·" : Number(r.costPerSignup).toFixed(2)}</b> each
            {r.pending ? <div className="italic text-ink-3">Some rows are PENDING. The net is planned, not paid yet.</div> : null}
            {view.roundTwo ? (
              <div className="mt-1">
                Round 2, shown not executed: {view.roundTwo.map((x) => `${x.name} ${Math.round(x.share * 100)}`).join(" · ")} <Badge kind="SIMULATED" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Lit({ on, tone = "cobalt", children }) {
  return (
    <span className={`transition-opacity duration-500 ${on ? "opacity-100" : "opacity-35"}`}>
      <Chip tone={on ? tone : "neutral"}>{children}</Chip>
    </span>
  );
}
