"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// iOS Safari silently ignores HTMLMediaElement.volume, so loudness is
// controlled with a Web Audio GainNode instead — that works on every platform.
const GAIN = 0.15;
const STORAGE_KEY = "bid-royale:bg-music-muted";

/**
 * Background music for the demo site: loops the bundled track quietly.
 * Browsers block autoplay with sound, so playback starts on the visitor's
 * first interaction (click / keypress). The speaker toggle mutes and unmutes;
 * the choice persists in localStorage.
 */
export function BgMusic() {
  const audioRef = useRef(null);
  const gainRef = useRef(null);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Begin playback on the first user gesture (autoplay policy).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Route the element through a GainNode: the only loudness control iOS honors.
    let ctx = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = new AC();
        const src = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = GAIN;
        src.connect(gain);
        gain.connect(ctx.destination);
        gainRef.current = gain;
      }
    } catch {
      gainRef.current = null;
    }
    if (!gainRef.current) {
      // Web Audio unavailable — fall back to element volume (desktop only).
      audio.volume = GAIN;
    }

    const begin = () => {
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      audio.play().catch(() => {});
      window.removeEventListener("pointerdown", begin);
      window.removeEventListener("keydown", begin);
    };
    window.addEventListener("pointerdown", begin);
    window.addEventListener("keydown", begin);
    return () => {
      window.removeEventListener("pointerdown", begin);
      window.removeEventListener("keydown", begin);
      if (ctx) ctx.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (gainRef.current) {
      gainRef.current.gain.value = muted ? 0 : GAIN;
    } else {
      audio.muted = muted;
    }
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch {
      /* storage unavailable: play on, forget the preference */
    }
  }, [muted]);

  const toggle = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (!next) audioRef.current?.play().catch(() => {});
      return next;
    });
  }, []);

  return (
    <>
      <audio ref={audioRef} src="/bg-music.mp3" loop preload="auto" aria-hidden="true" />
      <button
        type="button"
        onClick={toggle}
        title={muted ? "Unmute background music" : "Mute background music"}
        aria-label={muted ? "Unmute background music" : "Mute background music"}
        aria-pressed={!muted}
        data-testid="bg-music-toggle"
        className="fixed bottom-4 right-4 z-50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-line bg-card text-[18px] shadow-lg transition-opacity hover:opacity-80"
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
