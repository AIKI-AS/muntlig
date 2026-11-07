"use client";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mountSignalSculpture, type SignalSculpture } from "./signal-sculpture";

/** Decorative only: the sign-in form never waits for the renderer. */
export function ProductScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SignalSculpture | null>(null);
  // Keep the manual choice across temporary focus and visibility suspensions.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const mounted = mountSignalSculpture(canvas.current);
    renderer.current = mounted;
    return () => {
      mounted?.dispose();
      renderer.current = null;
    };
  }, []);
  return (
    <div className="product-scene">
      <canvas ref={canvas} className="signal-canvas" aria-hidden="true" />
      <svg className="signal-fallback" viewBox="0 0 700 820" fill="none" aria-hidden="true">
        {Array.from({ length: 36 }, (_, index) => {
          const offset = index * 3.2;
          return <path key={index}
            d={`M ${174 + offset} 246 C ${536 - offset} 82, 638 364, ${420 - offset} 540 C ${252 + offset} 706, 48 484, ${174 + offset} 246 C ${296 + offset} 466, ${398 - offset} 240, ${420 - offset} 540`}
            stroke="currentColor" strokeWidth="1.2" opacity={0.3 + index / 55} />;
        })}
      </svg>
      <button
        className="signal-pause"
        type="button"
        aria-label={paused ? "Start animasjonen" : "Sett animasjonen på pause"}
        title={paused ? "Start animasjonen" : "Sett animasjonen på pause"}
        onClick={() => {
          const next = !paused;
          renderer.current?.setPaused(next);
          setPaused(next);
        }}
      >
        {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}
