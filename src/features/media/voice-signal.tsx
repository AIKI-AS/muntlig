"use client";
import { useEffect, useRef } from "react";

const bars = Array.from({ length: 43 }, (_, index) => {
  const x = (index - 21) * 5.5;
  return { x, height: Math.sqrt(124 ** 2 - x ** 2) * (1.15 + .2 * Math.cos(index * .45)) };
});

/** Movement is driven by the connected SDK analyser, never a simulated input. */
export function VoiceSignal({ active, speaking, readFrequency }: {
  active: boolean; speaking: boolean; readFrequency: () => Uint8Array;
}) {
  const root = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const lines = svg.querySelectorAll<SVGLineElement>(".voice-frequency");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const reset = () => lines.forEach((line) => line.style.removeProperty("transform"));
    const draw = () => {
      if (document.visibilityState !== "hidden" && !media.matches) {
        const data = readFrequency();
        lines.forEach((line, index) => {
          const value = data[Math.floor(index * data.length / lines.length)] ?? 0;
          line.style.transform = `scaleY(${.28 + value / 255 * 1.2})`;
        });
      }
      frame = requestAnimationFrame(draw);
    };
    if (active && !media.matches) frame = requestAnimationFrame(draw);
    const update = () => {
      cancelAnimationFrame(frame);
      reset();
      if (active && !media.matches) frame = requestAnimationFrame(draw);
    };
    media.addEventListener("change", update);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("change", update); reset(); };
  }, [active, readFrequency]);
  return <svg ref={root} className="voice-signal" viewBox="0 0 340 340" fill="none" aria-hidden="true" data-active={active} data-speaking={speaking}>
    <circle className="signal-outer" cx="170" cy="170" r="160" stroke="currentColor" strokeWidth=".6" />
    <circle className="signal-ring" cx="170" cy="170" r="146" stroke="currentColor" strokeWidth=".7" strokeDasharray="1 7" />
    <circle className="signal-ring" cx="170" cy="170" r="134" stroke="currentColor" strokeWidth=".6" />
    <g transform="translate(170 170)">{bars.map((bar, index) => <line className="voice-frequency" key={index} x1={bar.x} x2={bar.x} y1={-bar.height / 2} y2={bar.height / 2} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />)}</g>
    <path className="signal-compass" d="M170 5v10M170 325v10M5 170h10M325 170h10" stroke="currentColor" strokeWidth="1.4" />
  </svg>;
}
