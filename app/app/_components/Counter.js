"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** A number that tweens to `to` (impressions and signups climbing). Instant under reduced motion. */
export function Counter({ to, duration = 1.1, className = "" }) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    if (reduced || from.current === to) {
      from.current = to;
      setValue(to);
      return undefined;
    }
    const controls = animate(from.current, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        from.current = v;
        setValue(v);
      },
    });
    return () => controls.stop();
  }, [to, duration, reduced]);
  return <span className={`tabular-nums ${className}`}>{Math.round(value).toLocaleString("en-US")}</span>;
}
