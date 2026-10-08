"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { chainLink } from "@/lib/evidence/chain";
import { verifyItem } from "@/lib/evidence/verify";
import { Badge } from "../_components/Badge";

const FETCH_TIMEOUT_MS = 8000;
const GROUP_ORDER = ["setup", "auction", "traffic", "verdict", "money"];
const GROUP_LABEL = {
  setup: "Setup",
  auction: "Auction",
  traffic: "Signups and checks",
  verdict: "Verdicts",
  money: "Money",
};

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const entryOf = ({ bytes: _bytes, ...entry }) => entry;

/** Manifest-shaped view of a recorded bundle, for the offline worked example. */
function manifestFromItems(items) {
  return { source: "PRE-RECORDED", count: items.length, items: items.map(entryOf).sort((a, b) => a.name.localeCompare(b.name)) };
}

const EvidenceContext = createContext(null);

/**
 * Loads the run's evidence manifest and serves item bytes to the panels below it.
 * With no run, or when the run cannot be loaded, it serves the recorded bundle (PRE-RECORDED), which works offline.
 * `version` is any value that changes when the run changes, so the manifest is fetched again.
 */
export function EvidenceProvider({ runId, fixtureEvidence, version, children }) {
  const [state, setState] = useState(() => ({ manifest: runId ? null : manifestFromItems(fixtureEvidence ?? []), offline: !runId }));

  useEffect(() => {
    if (!runId) {
      setState({ manifest: manifestFromItems(fixtureEvidence ?? []), offline: true });
      return undefined;
    }
    let stop = false;
    getJson(`/api/run/${encodeURIComponent(runId)}/evidence`)
      .then((manifest) => !stop && setState({ manifest, offline: false }))
      .catch(() => !stop && setState({ manifest: manifestFromItems(fixtureEvidence ?? []), offline: true }));
    return () => {
      stop = true;
    };
  }, [runId, fixtureEvidence, version]);

  const getItem = useCallback(
    async (name) => {
      if (state.offline) return (fixtureEvidence ?? []).find((i) => i.name === name) ?? null;
      const body = await getJson(`/api/run/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(name)}`);
      return body.item ?? null;
    },
    [state.offline, fixtureEvidence, runId],
  );

  const value = useMemo(() => ({ ...state, runId, getItem }), [state, runId, getItem]);
  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

const short = (hash) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "");

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Row({ entry, ctx, extra }) {
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const verify = async () => {
    setResult({ busy: true });
    try {
      const item = await ctx.getItem(entry.name);
      if (!item) return setResult({ ok: false, note: "The stored file could not be found." });
      // The manifest hash is what is being checked, so a server that swaps both bytes and hash is still caught.
      const out = await verifyItem({ ...item, hash: entry.hash, size: entry.size });
      setResult({ ok: out.ok, actual: out.actual, checks: out.checks });
    } catch (err) {
      setResult({ ok: false, note: `Could not read the stored file (${err?.name === "AbortError" ? "timeout" : err.message}).` });
    }
  };

  const copy = async () => {
    if (await copyText(entry.hash)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <li className="border-b border-dashed border-line py-2 last:border-b-0" data-testid={`evidence-${entry.name}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-[180px] flex-1">{entry.label}</span>
        <code className="font-mono text-[12px]" title={entry.hash}>{short(entry.hash)}</code>
        <button type="button" onClick={copy} className="cursor-pointer rounded-[6px] border border-line px-2 py-px text-[12px]">
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={verify} className="cursor-pointer rounded-[6px] bg-cobalt px-2 py-px text-[12px] text-white">
          Verify
        </button>
        {ctx.offline ? null : (
          <a
            href={`/api/run/${encodeURIComponent(ctx.runId)}/evidence/${encodeURIComponent(entry.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-cobalt"
          >
            File ↗
          </a>
        )}
      </div>
      {result ? (
        <div className="mt-1 text-[12.5px]" role="status" data-result={result.busy ? "busy" : result.ok ? "match" : "mismatch"}>
          {result.busy ? (
            "Recomputing in your browser…"
          ) : result.ok ? (
            <span className="font-semibold text-pass">Match. The stored file hashes to this fingerprint.</span>
          ) : (
            <span className="font-semibold text-under">
              Mismatch. {result.note ?? "The stored file does not hash to this fingerprint."}
            </span>
          )}
          {result.checks
            ? result.checks.map((c) => (
                <div key={c.label} className={c.ok ? "opacity-75" : "text-under"}>
                  {c.ok ? "✓" : "✗"} {c.label}
                </div>
              ))
            : null}
        </div>
      ) : null}
      {extra}
    </li>
  );
}

/** What the chain holds for this verdict: the hash the Board submitted as the award's result, and the escrow tx. */
function ChainLine({ link, source }) {
  return (
    <div className="mt-1 text-[12.5px] opacity-90">
      On the chain: the award escrow carries {link.fallback ? "this verdict hash (no delivery report was posted)" : "the delivery result hash"} as its result.{" "}
      {link.explorerUrl ? (
        <>
          <Badge kind="REAL" />{" "}
          <a href={link.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-cobalt">
            Escrow transaction {short(link.txHash)} ↗
          </a>
        </>
      ) : link.badge === "PENDING" ? (
        <span className="font-mono text-[10.5px] font-semibold">PENDING</span>
      ) : (
        <>
          <Badge kind={source === "PRE-RECORDED" ? "PRE-RECORDED" : "SIMULATED"} /> Nothing on the chain for this one.
        </>
      )}
    </div>
  );
}

/**
 * The Evidence panel. Without `supplier` it lists the whole bundle by group. With `supplier` it lists that
 * supplier's files (bid, signups, checks, verdict). Each hash can be copied, and Verify recomputes it in the browser.
 */
export function EvidencePanel({ supplier = null }) {
  const ctx = useContext(EvidenceContext);
  const [ledger, setLedger] = useState(null);
  const manifest = ctx?.manifest ?? null;
  const items = useMemo(
    () => (manifest?.items ?? []).filter((i) => !supplier || i.supplier === supplier || i.name === "allocation"),
    [manifest, supplier],
  );

  useEffect(() => {
    let stop = false;
    if (!ctx || !manifest?.items?.some((i) => i.name === "ledger")) return undefined;
    ctx
      .getItem("ledger")
      .then((item) => !stop && item && setLedger(JSON.parse(item.bytes)))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [ctx, manifest]);

  if (!ctx || !manifest || items.length === 0) return null;

  const hasReport = (name) => manifest.items.some((i) => i.name === name);
  const groups = GROUP_ORDER.map((g) => [g, items.filter((i) => i.group === g)]).filter(([, list]) => list.length);
  const source = manifest.source === "PRE-RECORDED" || ctx.offline ? "PRE-RECORDED" : "live";

  return (
    <details className="mt-2 rounded-[10px] border border-line bg-card px-3 py-2 text-[13.5px]" data-testid={supplier ? `evidence-panel-${supplier}` : "evidence-panel"}>
      <summary className="cursor-pointer font-semibold">
        Evidence{supplier ? "" : ` · ${manifest.count} files`}
        {source === "PRE-RECORDED" ? <Badge kind="PRE-RECORDED" /> : null}
      </summary>
      <p className="mt-1 text-[12.5px] opacity-75">
        Each file has a fingerprint (SHA-256). Verify recomputes it here in your browser from the stored file. If one byte changed, it shows Mismatch.
        {source === "PRE-RECORDED" ? " This bundle is a recorded run, checked offline." : ""}
      </p>
      {groups.map(([group, list]) => (
        <div key={group} className="mt-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.04em] opacity-60">{GROUP_LABEL[group]}</div>
          <ul>
            {list.map((entry) => (
              <Row
                key={entry.name}
                entry={entry}
                ctx={ctx}
                extra={
                  entry.name.startsWith("verdict.") && ledger ? (
                    <ChainLine link={chainLink(ledger, entry.supplier, { hasReport: hasReport(`result.${entry.supplier}`) })} source={source} />
                  ) : null
                }
              />
            ))}
          </ul>
        </div>
      ))}
      {!supplier && manifest.bundleHash ? (
        <div className="mt-2 border-t border-dashed border-line pt-2 text-[12.5px]">
          Bundle fingerprint <code className="font-mono" title={manifest.bundleHash}>{short(manifest.bundleHash)}</code>
        </div>
      ) : null}
    </details>
  );
}
