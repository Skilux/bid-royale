"use client";

import { useState } from "react";

const prague = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Prague" });

/** One banner per mode (#66 D1): a recording, a live real run, nothing for a simulated run. */
export function RunBanner({ kind, recordedAt, runId }) {
  const [copied, setCopied] = useState(false);
  if (kind === "simulated") return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?run=${encodeURIComponent(runId)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mb-2.5 rounded-lg border border-cobalt/40 bg-wash px-3 py-2 text-[12.5px] text-ink-2" data-testid="run-banner" data-banner={kind}>
      {kind === "recording" ? (
        <>
          Recording of a real run on Cardano preprod, {prague.format(new Date(recordedAt))}. Amounts with ↗ are REAL transactions you can check. Everything else replays that run.
        </>
      ) : (
        <>
          Live run on Cardano preprod. Settlement waits for the Masumi escrow and takes about 15–20 minutes. You can close this page and come back:{" "}
          {runId ? (
            <button type="button" onClick={copy} className="cursor-pointer text-cobalt underline" data-testid="copy-link">
              {copied ? "copied" : "copy link"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
