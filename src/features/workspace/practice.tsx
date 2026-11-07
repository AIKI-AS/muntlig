"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Flag,
  Send,
} from "lucide-react";
import type { Review, Session, Source } from "@/lib/contracts";
import { api, ApiError, message, post } from "@/lib/client-api";
import { LIMITS } from "@/lib/limits";
import { PracticeMedia } from "@/features/media/practice-media";
import { Dialog, ErrorNotice, Loading, SourceDialog } from "./ui";

export function Practice({
  id,
  onFinish,
}: {
  id: string;
  onFinish: (review: Review) => Promise<void>;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState<string | null>(null),
    [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false),
    [finishing, setFinishing] = useState(false),
    [confirmFinish, setConfirmFinish] = useState(false);
  const [source, setSource] = useState<Source | null>(null),
    [boardTab, setBoardTab] = useState<"source" | "goal" | "connections">(
      "source",
    );
  const messages = useRef<HTMLDivElement>(null),
    answerInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let live = true;
    api<Session>("/api/sessions/" + id)
      .then((value) => {
        if (live) setSession(value);
      })
      .catch((error) => {
        if (live) setError(message(error));
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    const region = messages.current;
    if (region) region.scrollTop = region.scrollHeight;
  }, [session?.turns.length]);
  async function handleFailure(error: unknown) {
    if (error instanceof ApiError && error.status === 409) {
      try {
        setSession(await api<Session>("/api/sessions/" + id));
      } catch (reloadError) {
        setError(message(reloadError));
        return;
      }
    }
    setError(message(error));
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!session || !answer.trim() || busy) return;
    if (answer.trim().length > LIMITS.answer) {
      setError(`Forkort svaret til ${LIMITS.answer} tegn før du sender.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await post<Session>("/api/sessions/" + id + "/turn", {
        text: answer.trim(),
        expectedTurnCount: session.turns.length,
      });
      setSession(next);
      setAnswer("");
      answerInput.current?.focus();
    } catch (error) {
      await handleFailure(error);
    } finally {
      setBusy(false);
    }
  }
  async function nextGoal() {
    setBusy(true);
    setError(null);
    try {
      setSession(await post<Session>("/api/sessions/" + id + "/next"));
    } catch (error) {
      await handleFailure(error);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await onFinish(await post<Review>("/api/sessions/" + id + "/finish"));
    } catch (error) {
      await handleFailure(error);
      setConfirmFinish(false);
    } finally {
      setFinishing(false);
    }
  }
  if (!session)
    return error ? (
      <div className="page">
        <ErrorNotice>{error}</ErrorNotice>
        <Link className="button secondary" href="/">
          Til fagpakkene
        </Link>
      </div>
    ) : (
      <Loading label="Gjør klar fagpraten …" />
    );
  if (session.status === "completed")
    return (
      <div className="page">
        <h1>Økten er avsluttet.</h1>
        <Link className="button primary" href={"/review/" + id}>
          Se gjennomgangen
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  const goal =
    session.pack.goals.find((item) => item.id === session.activeGoalId) ??
    session.pack.goals[0];
  const lastAssistant = session.turns
    .filter((turn) => turn.role === "assistant")
    .at(-1);
  const cited =
    lastAssistant?.sourceIds
      .map((id) => session.pack.sources.find((source) => source.id === id))
      .filter((source): source is Source => !!source) ?? [];
  const goalSources = session.pack.sources.filter((source) =>
    goal?.sourceIds.includes(source.id),
  );
  const boardSources = cited.length ? cited : goalSources;
  const goalIndex = session.pack.goals.findIndex(
    (item) => item.id === session.activeGoalId,
  );
  return (
    <div className="practice-page">
      <header className="practice-header">
        <div>
          <Link href="/" className="back-link">
            <ArrowLeft size={15} />
            Arbeidsrom
          </Link>
          <h1>{session.pack.title}</h1>
          <span className="muted">
            {session.pack.subject} · {session.pack.level} · versjon{" "}
            {session.packVersion}
          </span>
        </div>
        <button
          className="button secondary"
          onClick={() => setConfirmFinish(true)}
          disabled={busy || finishing}
        >
          <Flag size={16} />
          Avslutt økten
        </button>
      </header>
      <div className="practice-grid">
        <aside className="goal-rail">
          <p className="quiet-label">Det vi øver på</p>
          <ol>
            {session.pack.goals.map((item, index) => {
              const explored = session.evidence.some(
                (evidence) => evidence.goalId === item.id,
              );
              return (
                <li
                  className={
                    item.id === session.activeGoalId ? "active-goal" : ""
                  }
                  key={item.id}
                >
                  <span className={explored ? "goal-dot explored" : "goal-dot"}>
                    {explored ? <Check size={12} /> : index + 1}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {explored
                        ? "Undersøkt"
                        : item.id === session.activeGoalId
                          ? "I samtalen nå"
                          : "Ikke undersøkt"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="rail-note">
            Det er lov å tenke høyt, gjøre feil og be om hjelp.
          </div>
          <span className="pack-lock">
            Låst fagpakke · v{session.packVersion}
          </span>
        </aside>
        <section className="conversation" aria-label="Fagsamtalen">
          <div className="conversation-heading">
            <span className="trainer-mark">m</span>
            <div>
              <strong>Din fagtrener</strong>
              <span>
                {busy
                  ? "Tenker på forklaringen din …"
                  : "Spør, lytter og følger opp"}
              </span>
            </div>
            <span className="conversation-state">
              <span className="live-dot" />
              Pågår
            </span>
          </div>
          <div
            className="conversation-messages"
            ref={messages}
            role="log"
            aria-label="Samtalehistorikk"
            aria-live="polite"
            aria-relevant="additions"
          >
            {session.turns.map((turn) => (
              <article className={"turn " + turn.role} key={turn.id}>
                <span className="turn-label">
                  {turn.role === "assistant" ? "Fagtreneren" : "Dine ord"}
                </span>
                <p>{turn.text}</p>
                {turn.role === "assistant" && turn.sourceIds.length ? (
                  <div className="citations">
                    {turn.sourceIds.map((id) => {
                      const item = session.pack.sources.find(
                        (source) => source.id === id,
                      );
                      return item ? (
                        <button key={id} onClick={() => setSource(item)}>
                          <FileText size={12} />
                          {item.title} · s. {item.page}
                        </button>
                      ) : null;
                    })}
                  </div>
                ) : null}
              </article>
            ))}
            {busy ? (
              <div className="thinking-status" role="status">
                <span className="thinking-dot" />
                Treneren følger opp …
              </div>
            ) : null}
          </div>
          <div className="answer-area">
            {error ? <ErrorNotice>{error}</ErrorNotice> : null}
            <PracticeMedia
              session={session}
              busy={busy || finishing}
              onTranscript={(text) => {
                setAnswer((current) => (current ? current + " " + text : text));
                answerInput.current?.focus();
              }}
              onError={setError}
            />
            <form onSubmit={send} className="answer-form">
              <label className="sr-only" htmlFor="student-answer">
                Ditt svar til fagtreneren
              </label>
              <textarea
                ref={answerInput}
                id="student-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                maxLength={LIMITS.answer}
                placeholder="Forklar med egne ord. Det trenger ikke være perfekt."
                disabled={busy || finishing}
              />
              <div className="answer-toolbar">
                <span>
                  {session.mode === "text"
                    ? "Tekstøving"
                    : "Du kan også skrive svaret"}
                </span>
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Send svaret"
                  disabled={!answer.trim() || busy || finishing}
                >
                  <Send size={17} />
                </button>
              </div>
            </form>
            <p className="fine-print">
              KI kan ta feil. Kildene og dine egne forklaringer er det viktige.
            </p>
          </div>
        </section>
        <aside className="board" aria-label="Dynamisk fagtavle">
          <div className="section-heading">
            <h2>Fagtavla</h2>
            <span className="muted">Til støtte underveis</span>
          </div>
          <div className="board-tabs" role="group" aria-label="Velg tavlekort">
            {(
              [
                { id: "source", label: "Kilde" },
                { id: "goal", label: "Mål" },
                { id: "connections", label: "Sammenheng" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setBoardTab(tab.id)}
                aria-pressed={boardTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {boardTab === "source" ? (
            <div className="board-content">
              <p className="quiet-label">Fagstoff til spørsmålet</p>
              {boardSources.map((item) => (
                <article className="board-source" key={item.id}>
                  <span className="document-label">
                    <FileText size={14} />
                    Side {item.page}
                  </span>
                  <p>{item.text}</p>
                  <button className="text-link" onClick={() => setSource(item)}>
                    Åpne hele utdraget
                    <ChevronRight size={14} />
                  </button>
                </article>
              ))}
              {!boardSources.length ? (
                <p className="muted">
                  Ingen kilde ble knyttet til dette spørsmålet.
                </p>
              ) : null}
            </div>
          ) : null}
          {boardTab === "goal" ? (
            <div className="board-content">
              <p className="quiet-label">
                Mål {goalIndex + 1} av {session.pack.goals.length}
              </p>
              <h3>{goal.title}</h3>
              <p>{goal.prompt}</p>
              <div className="board-note">
                Prøv først med dine egne ord. Be om hjelp hvis du står fast.
              </div>
            </div>
          ) : null}
          {boardTab === "connections" ? (
            <div className="board-content">
              <p className="quiet-label">Målet og kildegrunnlaget</p>
              <h3>{goal.title}</h3>
              <div className="connection-line" />
              {goalSources.map((item) => (
                <button
                  className="connection-source"
                  key={item.id}
                  onClick={() => setSource(item)}
                >
                  <FileText size={16} />
                  <span>
                    {item.title}
                    <small>Side {item.page}</small>
                  </span>
                </button>
              ))}
              <p className="fine-print">
                Tavla viser bare koblinger som læreren har godkjent i fagpakken.
              </p>
            </div>
          ) : null}
          {goalIndex < session.pack.goals.length - 1 ? (
            <button
              className="text-link next-goal"
              onClick={nextGoal}
              disabled={busy || finishing}
            >
              Gå videre til neste mål
              <ArrowRight size={14} />
            </button>
          ) : null}
          <p className="board-footer">
            Et mål blir ikke undersøkt bare fordi du åpner det.
          </p>
        </aside>
      </div>
      <SourceDialog source={source} onClose={() => setSource(null)} />
      <Dialog
        open={confirmFinish}
        onClose={() => {
          if (!finishing) setConfirmFinish(false);
        }}
        title="Klar for å se hva du viste?"
      >
        <p>
          Vi samler dine egne svar, kildene og målene dere undersøkte. Mål dere
          ikke rakk, markeres som ikke undersøkt.
        </p>
        {answer.trim() ? (
          <p className="notice">
            Du har et svar som ikke er sendt. Det blir ikke med i gjennomgangen.
          </p>
        ) : null}
        <div className="dialog-actions">
          <button
            className="button secondary"
            onClick={() => setConfirmFinish(false)}
            disabled={finishing}
          >
            Fortsett økten
          </button>
          <button
            className="button primary"
            onClick={finish}
            disabled={finishing}
          >
            {finishing ? "Samler gjennomgangen …" : "Avslutt og se gjennomgang"}
            <ArrowRight size={16} />
          </button>
        </div>
      </Dialog>
    </div>
  );
}
