"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  FileText,
  HelpCircle,
} from "lucide-react";
import {
  evidenceLabels,
  type Review as ReviewData,
  type Source,
} from "@/lib/contracts";
import { api, message } from "@/lib/client-api";
import { ErrorNotice, Heading, Loading, SourceDialog } from "./ui";

function timestamp(start: string, at: string) {
  const seconds = Math.max(
    0,
    Math.floor((new Date(at).getTime() - new Date(start).getTime()) / 1000),
  );
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}
export function Review({ id }: { id: string }) {
  const [review, setReview] = useState<ReviewData | null>(null),
    [error, setError] = useState<string | null>(null),
    [source, setSource] = useState<Source | null>(null),
    [cleaning, setCleaning] = useState(false),
    [cleanupError, setCleanupError] = useState<string | null>(null),
    [cleaned, setCleaned] = useState(false),
    [attempt, setAttempt] = useState(0);
  const cleanup = useRef<AbortController | null>(null);
  const cleanupStatus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<ReviewData>("/api/sessions/" + id + "/review", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setReview(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error));
      });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => () => cleanup.current?.abort(), [id]);
  useEffect(() => {
    if (cleaned) cleanupStatus.current?.focus();
  }, [cleaned]);
  // Explicit user action only: loading the review never deletes anything. The saved review stays on screen if this fails.
  async function retryCleanup() {
    const controller = new AbortController();
    cleanup.current = controller;
    setCleaning(true);
    setCleanupError(null);
    try {
      const next = await api<ReviewData>("/api/sessions/" + id + "/finish", {
        method: "POST",
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setReview(next);
        setCleaned(!next.cleanupPending);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setCleanupError(message(failure));
    } finally {
      if (!controller.signal.aborted) setCleaning(false);
    }
  }
  if (!review)
    return error ? (
      <div className="page">
        <Heading title="Gjennomgangen kunne ikke hentes." />
        <ErrorNotice>{error}</ErrorNotice>
        <button className="button primary" onClick={() => {
          document.getElementById("main-content")?.focus({ preventScroll: true });
          setError(null);
          setAttempt(current => current + 1);
        }}>
          Prøv igjen
        </button>
        <Link href="/sessions" className="button secondary">
          Til øktene
        </Link>
      </div>
    ) : (
      <Loading label="Henter gjennomgangen …" layout="review" />
    );
  const { session, goals } = review;
  return (
    <div className="page review-page">
      <Link className="back-link" href="/sessions">
        <ArrowLeft size={15} />
        Mine økter
      </Link>
      <Heading
        title="Dette fikk du satt ord på."
        description={session.pack.title + " · " + session.pack.subject}
      />
      <section className="review-summary">
        <div>
          <p className="review-count">
            <span>{review.explored}</span> av {goals.length} mål undersøkt
          </p>
          <p className="muted">
            Ikke en karakter. Et utgangspunkt for neste samtale.
          </p>
        </div>
      </section>
      <div className="review-grid">
        <section
          aria-label="Gjennomgang per øvingsmål"
          className="evidence-list"
        >
          {goals.map((goal, index) => {
            const evidence = goal.evidence;
            const turn = evidence
              ? session.turns.find((item) => item.id === evidence.turnId)
              : null;
            const status = evidence?.status ?? "not_explored";
            const Icon =
              status === "independent"
                ? Check
                : status === "with_hint"
                  ? HelpCircle
                  : Circle;
            return (
              <article className={"evidence-card " + status} key={goal.id}>
                <div className="evidence-heading">
                  <span className="evidence-index">{index + 1}</span>
                  <div>
                    <h2>{goal.title}</h2>
                    <span className="evidence-status">
                      <Icon size={14} />
                      {evidenceLabels[status]}
                    </span>
                  </div>
                </div>
                {evidence && turn ? (
                  <>
                    <blockquote>
                      <p>«{evidence.quote}»</p>
                      <footer>
                        Dine ord ·{" "}
                        <a href={"#turn-" + turn.id}>
                          {timestamp(session.startedAt, turn.at)} i samtalen
                        </a>
                      </footer>
                    </blockquote>
                    <div className="evidence-sources">
                      {evidence.sourceIds.map((id) => {
                        const item = session.pack.sources.find(
                          (source) => source.id === id,
                        );
                        return item ? (
                          <button key={id} onClick={() => setSource(item)}>
                            <FileText size={13} />
                            {item.title} · s. {item.page}
                          </button>
                        ) : null;
                      })}
                    </div>
                    <p className="fine-print">
                      KI-observasjon basert på dette utdraget. Ikke en faglig
                      godkjenning.
                    </p>
                  </>
                ) : (
                  <p className="muted">
                    Dette målet fikk ingen dokumentert forklaring i økten. Vi
                    trekker ingen slutning om hva du kan.
                  </p>
                )}
              </article>
            );
          })}
        </section>
        <aside className="next-practice">
          <p className="quiet-label">En liten retning videre</p>
          <h2>
            {review.nextGoal
              ? "Dette kan du utforske videre."
              : "Prøv forklaringen én gang til."}
          </h2>
          <p>
            {review.nextGoal?.prompt ??
              "Forklar det samme uten hjelp, og prøv å finne et nytt eksempel. En god forklaring tåler et nytt spørsmål."}
          </p>
          <Link className="button primary" href={"/muntlig?pack=" + encodeURIComponent(session.packId)}>
            Tren videre
            <ArrowRight size={16} />
          </Link>
          {review.cleanupPending ? (
            <>
              <div className="preview-rule" />
              <p className="quiet-label">Opprydding gjenstår</p>
              <p>
                Gjennomgangen din er lagret. Den midlertidige
                ElevenLabs-agenten for samtalen er ikke ryddet ennå.
              </p>
              <button
                className="button secondary"
                onClick={() => void retryCleanup()}
                disabled={cleaning}
                aria-busy={cleaning}
              >
                {cleaning ? "Rydder opp …" : "Prøv opprydding igjen"}
              </button>
              {cleanupError ? <ErrorNotice>{cleanupError}</ErrorNotice> : null}
            </>
          ) : null}
          {cleaned ? (
            <p ref={cleanupStatus} role="status" tabIndex={-1} className="muted">
              Den midlertidige samtaleagenten er ryddet.
            </p>
          ) : null}
          <div className="preview-rule" />
          <p className="fine-print">
            Gjennomgangen bruker fagpakke versjon {session.packVersion}. Rålyd
            og avatarvideo lagres ikke.
          </p>
        </aside>
      </div>
      <details className="transcript">
        <summary>Se hele samtalen ({session.turns.length} innlegg)</summary>
        <div>
          {session.turns.map((turn) => (
            <article
              id={"turn-" + turn.id}
              key={turn.id}
              className={"transcript-turn " + turn.role}
            >
              <span>
                {turn.role === "user" ? "Dine ord" : "Fagtreneren"} ·{" "}
                {timestamp(session.startedAt, turn.at)}
              </span>
              <p>{turn.text}</p>
            </article>
          ))}
        </div>
      </details>
      <SourceDialog source={source} onClose={() => setSource(null)} />
    </div>
  );
}
