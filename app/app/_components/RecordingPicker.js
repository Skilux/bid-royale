"use client";

import { listRecordings, summaryLine } from "@/lib/replay/catalog";
import { Badge } from "./Badge";

const RECORDINGS = listRecordings();

/** Puts ?replay=<id> in the address bar without a navigation, so the URL always names the recording on screen. */
export function setReplayInUrl(id) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("replay", id);
  url.searchParams.delete("run");
  url.searchParams.delete("mode");
  window.history.replaceState(null, "", url);
}

/**
 * Which recorded run to play. "cards" is the judge page: one radio card per recording with its one-line summary,
 * and the badge note of the picked one under the row. "select" is the compact dashboard header.
 * Every recording plays PRE-RECORDED, and REAL rows in it keep their explorer link.
 */
export function RecordingPicker({ value, onChange, variant = "cards" }) {
  const picked = RECORDINGS.find((r) => r.id === value) ?? RECORDINGS[0];

  if (variant === "select") {
    return (
      <select
        aria-label="Recorded run"
        data-testid="replay-select"
        title={`${summaryLine(picked)}. ${picked.badgeNote}`}
        className="max-w-[16rem] cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink"
        value={picked.id}
        onChange={(e) => onChange(e.target.value)}
      >
        {RECORDINGS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
    );
  }

  return (
    <fieldset className="min-w-0" data-testid="replay-picker">
      <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">Recorded run to play</legend>
      <div role="radiogroup" aria-label="Recorded run" className="flex flex-wrap gap-2">
        {RECORDINGS.map((r) => (
          <label key={r.id} className="relative block min-w-0 flex-1 basis-[14rem] cursor-pointer">
            <input
              type="radio"
              name="replay"
              value={r.id}
              checked={r.id === picked.id}
              onChange={() => onChange(r.id)}
              data-testid={`replay-${r.id}`}
              className="peer sr-only"
            />
            <span className="block h-full rounded-lg border border-line bg-card px-3 py-2 peer-checked:border-ink peer-checked:ring-1 peer-checked:ring-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cobalt hover:border-ink-2">
              <span className="block text-[13.5px] font-semibold leading-tight">{r.title}</span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-2">{summaryLine(r)}</span>
              <span className="mt-1 block text-[11px] text-ink-3">
                {r.runId}
                <Badge kind="PRE-RECORDED" />
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-2" data-testid="replay-note">
        {picked.badgeNote}
      </p>
    </fieldset>
  );
}
