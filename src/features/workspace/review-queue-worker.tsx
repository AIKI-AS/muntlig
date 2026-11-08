"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Review } from "@/lib/contracts";
import { api } from "@/lib/client-api";
import { applyOutcome, attemptReview, planWork, reviewQueue, type ReviewEntry } from "./review-queue";

type Ready = { sessionId: string; title: string };

/**
 * Runs the review queue for the signed-in actor. Mounted once in MuntligApp so it survives in-app navigation.
 * At most one request per session is in flight; timers and requests are cancelled on unmount.
 */
export function ReviewQueueWorker({ actorId, onReady }: { actorId: string; onReady: () => Promise<void> }) {
  const [ready, setReady] = useState<Ready[]>([]);
  const latestOnReady = useRef(onReady);
  useEffect(() => { latestOnReady.current = onReady; });
  useEffect(() => {
    reviewQueue.bind(actorId);
    const inFlight = new Map<string, AbortController>();
    let timer: number | undefined;
    let stopped = false;
    const pump = () => {
      window.clearTimeout(timer);
      if (stopped) return;
      const { due, wakeAt } = planWork(reviewQueue.snapshot().values(), new Set(inFlight.keys()), Date.now());
      for (const id of due) void run(id);
      if (wakeAt !== null) timer = window.setTimeout(pump, Math.max(0, wakeAt - Date.now()));
    };
    async function run(sessionId: string) {
      const controller = new AbortController();
      inFlight.set(sessionId, controller);
      const outcome = await attemptReview(sessionId, {
        finish: (id) => api<Review>(`/api/sessions/${id}/finish`, { method: "POST", signal: controller.signal }),
        review: (id) => api<Review>(`/api/sessions/${id}/review`, { signal: controller.signal }),
      });
      inFlight.delete(sessionId);
      if (stopped || controller.signal.aborted) return;
      const entry = reviewQueue.get(sessionId);
      if (!entry) return pump();
      reviewQueue.settle(sessionId, applyOutcome(entry, outcome, Date.now()));
      if (outcome.kind === "ready") {
        setReady((items) => [...items.filter((item) => item.sessionId !== sessionId), { sessionId, title: outcome.review.session.pack.title }]);
        void latestOnReady.current();
      }
      pump();
    }
    const unsubscribe = reviewQueue.subscribe(pump);
    pump();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      unsubscribe();
      for (const controller of inFlight.values()) controller.abort();
      reviewQueue.unbind();
    };
  }, [actorId]);
  const dismiss = (sessionId: string) => setReady((items) => items.filter((item) => item.sessionId !== sessionId));
  return (
    <div className="review-notices" role="status" aria-live="polite">
      {ready.map((item) => (
        <div className="review-notice" key={item.sessionId}>
          <div>
            <strong>Gjennomgangen er klar</strong>
            <span>{item.title}</span>
          </div>
          <Link className="button primary" href={"/review/" + item.sessionId} onClick={() => dismiss(item.sessionId)}>
            Åpne gjennomgangen
          </Link>
          <button type="button" className="icon-button" aria-label="Lukk beskjeden" title="Lukk" onClick={() => dismiss(item.sessionId)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Status of a queued session in a list row. Such a row never links back into the practice room. */
export function ReviewQueueState({ entry }: { entry: ReviewEntry }) {
  if (entry.state === "waiting") {
    return <span className="review-state" data-state="waiting"><i className="review-spinner" aria-hidden="true" />Gjennomgang lages …</span>;
  }
  return (
    <span className="review-state" data-state="failed">
      <span>Gjennomgangen feilet ·{" "}
        <button type="button" className="text-link review-retry" onClick={() => reviewQueue.retry(entry.sessionId)}>Prøv igjen</button>
      </span>
      {entry.error ? <small>{entry.error}</small> : null}
    </span>
  );
}
