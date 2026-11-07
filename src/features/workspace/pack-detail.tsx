"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Clock3,
  FileText,
  Info,
  MessageSquare,
  Video,
} from "lucide-react";
import type {
  Integrations,
  Pack,
  PracticeMode,
  Session,
  Source,
} from "@/lib/contracts";
import { message, post } from "@/lib/client-api";
import { Dialog, ErrorNotice, Heading, SourceDialog, Status } from "./ui";

export function PackDetail({
  pack,
  teacher,
  integrations,
  onPublish,
  onStart,
}: {
  pack: Pack;
  teacher: boolean;
  integrations: Integrations;
  onPublish: (pack: Pack) => Promise<void>;
  onStart: (session: Session) => Promise<void>;
}) {
  const [source, setSource] = useState<Source | null>(null),
    [chooseMode, setChooseMode] = useState(false),
    [mode, setMode] = useState<PracticeMode>(integrations.avatar ? "avatar" : integrations.voice ? "voice" : "text");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const modeAvailable = mode === "voice"
    ? integrations.voice
    : mode === "avatar"
      ? integrations.avatar
      : integrations.llm;
  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await onPublish(await post<Pack>("/api/packs/" + pack.id + "/publish"));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const session = await post<Session>("/api/sessions", {
        packId: pack.id,
        mode,
      });
      await onStart(session);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page detail-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        Fagpakker
      </Link>
      <Heading
        title={pack.title}
        description={pack.subject + " · " + pack.level}
      />
      <div className="detail-grid">
        <section className="detail-main">
          <div className="lesson-intro">
            <div className="section-heading">
              <Status published={pack.status === "published"} />
              <span className="muted">Versjon {pack.version}</span>
            </div>
            <p className="lesson-description">{pack.description}</p>
            <div className="pack-meta">
              <span>
                <Clock3 size={16} />
                {pack.minutes} minutter
              </span>
              <span>
                <AudioLines size={16} />I ditt eget tempo
              </span>
            </div>
          </div>
          <div className="form-section">
            <h2>Dette øver du på</h2>
            <ol className="detail-goals">
              {pack.goals.map((goal, index) => (
                <li key={goal.id}>
                  <span className="goal-number">{index + 1}</span>
                  <div>
                    <h3>{goal.title}</h3>
                    <p>{goal.prompt}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="form-section">
            <div className="section-heading">
              <h2>Fagstoffet bak samtalen</h2>
              <span className="muted">{pack.sources.length} kildeutdrag</span>
            </div>
            <div className="source-links">
              {pack.sources.map((item) => (
                <button key={item.id} onClick={() => setSource(item)}>
                  <FileText size={17} />
                  <span>
                    {item.title}
                    <small>Side {item.page}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
        </section>
        <aside className="start-panel">
          <AudioLines size={30} strokeWidth={1.2} />
          <h2>
            La oss høre{" "}
            <br />
            hvordan du tenker.
          </h2>
          <p>Du får spørsmål, tid til å tenke og hjelp når du trenger det.</p>
          <ul className="promise-list">
            <li>
              <Check size={15} />
              Ingen karakter eller eksamensprosent
            </li>
            <li>
              <Check size={15} />
              Du kan alltid svare med tekst
            </li>
            <li>
              <Check size={15} />
              Kildene er tilgjengelige underveis
            </li>
          </ul>
          {error && !chooseMode ? <ErrorNotice>{error}</ErrorNotice> : null}
          {pack.status === "draft" && teacher ? (
            <>
              <button
                className="button primary wide"
                onClick={publish}
                disabled={busy}
              >
                {busy ? "Publiserer …" : "Publiser fagpakken"}
                <ArrowRight size={17} />
              </button>
              <p className="fine-print">
                Blir tilgjengelig for elever på skolen. Den publiserte versjonen
                låses.
              </p>
            </>
          ) : (
            <>
              {teacher ? <button
                className="button primary wide"
                onClick={() => setChooseMode(true)}
                disabled={busy}
              >
                Start prøveøkt
                <ArrowRight size={17} />
              </button> : <Link className="button primary wide" href={"/muntlig?pack=" + encodeURIComponent(pack.id)}>
                Velg mål og øv muntlig<ArrowRight size={17} />
              </Link>}
              {!integrations.llm && !integrations.voice ? (
                <p className="fine-print">
                  ElevenLabs er ikke koblet til ennå. Du kan se øktvalgene, men vi simulerer ikke en samtale.
                </p>
              ) : (
                <p className="fine-print">
                  {teacher ? "Økten starter når du velger hvordan du vil øve." : "Velg mål og hva du vil bli tryggere på før samtalen."}
                </p>
              )}
            </>
          )}
        </aside>
      </div>
      <SourceDialog source={source} onClose={() => setSource(null)} />
      <Dialog
        open={chooseMode}
        onClose={() => {
          if (!busy) setChooseMode(false);
        }}
        title="Hvordan vil du øve?"
      >
        <p className="muted">
          Samme fagstoff. Samme mål. Velg det som passer deg.
        </p>
        <div className="mode-options">
          {(
            [
              {
                id: "avatar",
                title: "Møt fagtreneren",
                description: "Simli-avatar med ElevenLabs-stemme og samtale.",
                icon: Video,
                available: integrations.avatar,
              },
              {
                id: "voice",
                title: "Bare tale",
                description: "Samme ElevenLabs-samtale, uten avatarvideo.",
                icon: AudioLines,
                available: integrations.voice,
              },
              {
                id: "text",
                title: "Skriv med treneren",
                description: "Et rolig alternativ. Ingen mikrofon.",
                icon: MessageSquare,
                available: integrations.llm,
              },
            ] as const
          ).map((option) => (
            <label
              className={
                mode === option.id ? "mode-option selected" : "mode-option"
              }
              key={option.id}
            >
              <option.icon size={20} strokeWidth={1.4} />
              <span>
                <strong>{option.title}</strong>
                <small>
                  {option.available
                    ? option.description
                    : "Ikke konfigurert i dette arbeidsrommet"}
                </small>
              </span>
              <input
                type="radio"
                name="practice-mode"
                value={option.id}
                checked={mode === option.id}
                onChange={() => setMode(option.id)}
                disabled={!option.available || busy}
              />
            </label>
          ))}
        </div>
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <div className="notice info-notice">
          <Info size={18} aria-hidden="true" />
          <span>Ikke oppgi sensitive personopplysninger. Tekst og strukturerte
          observasjoner lagres for gjennomgangen, ikke rålyd eller video.</span>
        </div>
        <button
          className="button primary wide"
          onClick={start}
          disabled={busy || !modeAvailable}
        >
          {busy ? "Gjør klar fagpraten …" : "Begynn øvingen"}
          <ArrowRight size={17} />
        </button>
      </Dialog>
    </div>
  );
}
