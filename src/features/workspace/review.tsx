"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  FileText,
  HelpCircle,
  Quote,
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
    [source, setSource] = useState<Source | null>(null);
  useEffect(() => {
    let live = true;
    api<ReviewData>("/api/sessions/" + id + "/review")
      .then((value) => {
        if (live) setReview(value);
      })
      .catch((error) => {
        if (live) setError(message(error));
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (!review)
    return error ? (
      <div className="page">
        <ErrorNotice>{error}</ErrorNotice>
        <Link href="/sessions" className="button secondary">
          Til øktene
        </Link>
      </div>
    ) : (
      <Loading label="Henter dine egne ord …" />
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
          <p className="quiet-label">Din gjennomgang</p>
          <p className="review-count">
            <span>{review.explored}</span> av {goals.length} mål undersøkt
          </p>
          <p className="muted">
            Ikke en karakter. Et utgangspunkt for neste samtale.
          </p>
        </div>
        <div className="review-summary-note">
          <Quote size={25} strokeWidth={1.2} />
          <p>
            Det er forklaringene dine som teller.
            <br />
            Ikke hvor raskt du svarte.
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
          <Link className="button primary" href={"/packs/" + session.packId}>
            Tren videre
            <ArrowRight size={16} />
          </Link>
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
