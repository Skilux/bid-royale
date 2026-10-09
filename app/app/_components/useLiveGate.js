"use client";

import { useMemo, useRef, useState } from "react";
import { createLiveGate } from "@/lib/run-source/live-gate";

/**
 * React face of `createLiveGate`: `asking` drives the dialog. `request` is the Run live click and sends nothing,
 * `confirm` is the only way the live start handler runs. Handlers are read at call time, so they can close over state.
 */
export function useLiveGate({ start, watchRecording, attach }) {
  const handlers = useRef({ start, watchRecording, attach });
  handlers.current = { start, watchRecording, attach };
  const [asking, setAsking] = useState(false);
  const gate = useMemo(
    () => createLiveGate({ start: () => handlers.current.start(), watchRecording: () => handlers.current.watchRecording(), attach: (id) => handlers.current.attach(id) }),
    [],
  );
  const sync = (fn) => (...args) => {
    const result = fn(...args);
    setAsking(gate.asking);
    return result;
  };
  return useMemo(
    () => ({ asking, request: sync(gate.request), confirm: sync(gate.confirm), attachTo: sync(gate.attachTo), watchInstead: sync(gate.watchInstead), cancel: sync(gate.cancel) }),
    [asking, gate],
  );
}
