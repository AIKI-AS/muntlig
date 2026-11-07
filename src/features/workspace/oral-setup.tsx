"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, AudioLines, BookOpen, Check, FileText, LockKeyhole, MessageSquare, TriangleAlert, Video } from "lucide-react";
import type { Integrations, Pack, PracticeFocus, PracticeMode, Session, Source } from "@/lib/contracts";
import { message, post } from "@/lib/client-api";
import { LIMITS } from "@/lib/limits";
import { practiceFocusLabels } from "@/lib/practice-plan";
import { Empty, ErrorNotice, Heading, SourceDialog } from "./ui";

const focuses = Object.entries(practiceFocusLabels) as [PracticeFocus, string][];
const modes = [
  { id: "avatar", title: "Med fagtrener", detail: "Avatar og naturlig tale", icon: Video },
  { id: "voice", title: "Bare tale", detail: "Uten avatarvideo", icon: AudioLines },
  { id: "text", title: "Skriv", detail: "Uten mikrofon", icon: MessageSquare },
] as const;

export function OralSetup({ packs, selectedId, integrations, onStart }: {
  packs: Pack[];
  selectedId: string | null;
  integrations: Integrations;
  onStart: (session: Session) => Promise<void>;
}) {
  const published = packs.filter(pack => pack.status === "published");
  const [packId, setPackId] = useState(() => published.find(pack => pack.id === selectedId)?.id ?? published[0]?.id ?? "");
  const pack = published.find(pack => pack.id === packId);
  const [goalIds, setGoalIds] = useState(() => pack?.goals.map(goal => goal.id) ?? []);
  const [focus, setFocus] = useState<PracticeFocus>("explain");
  const [request, setRequest] = useState("");
  const [mode, setMode] = useState<PracticeMode>(integrations.avatar ? "avatar" : integrations.voice ? "voice" : "text");
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startRequest = useRef<AbortController | null>(null);
  useEffect(() => () => startRequest.current?.abort(), []);
  const available = mode === "avatar" ? integrations.avatar : mode === "voice" ? integrations.voice : integrations.llm;
  function choosePack(id: string) {
    setPackId(id);
    setGoalIds(published.find(pack => pack.id === id)?.goals.map(goal => goal.id) ?? []);
    setError(null);
  }
  async function start(event: FormEvent) {
    event.preventDefault();
    if (!pack || !goalIds.length || !available || busy) return;
    const controller = new AbortController();
    startRequest.current = controller;
    setBusy(true);
    setError(null);
    try {
      const session = await post<Session>("/api/sessions", {
        packId: pack.id, mode,
        plan: { goalIds: pack.goals.filter(goal => goalIds.includes(goal.id)).map(goal => goal.id), focus, request: request.trim() },
      }, controller.signal);
      if (!controller.signal.aborted) await onStart(session);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(message(failure));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <div className="page oral-page">
    <Heading title="Hva vil du øve på?" />
    {!pack ? <Empty title="Temaene kommer fra læreren din." action={<Link className="button secondary" href="/">Til arbeidsrommet<ArrowRight size={16} /></Link>}>
      Ingen fagpakke er publisert ennå. Når læreren har gjort fagstoffet klart, kan du velge tema her.
    </Empty> : <form className="oral-grid" onSubmit={event => void start(event)}>
      <fieldset className="oral-choices" disabled={busy}>
        <legend className="sr-only">Forbered fagpraten</legend>
        <section className="oral-section">
          <label className="oral-label" htmlFor="oral-topic">Hva vil du snakke om?</label>
          <select id="oral-topic" value={pack.id} onChange={event => choosePack(event.target.value)}>
            {published.map(item => <option key={item.id} value={item.id}>{item.title} · {item.subject}</option>)}
          </select>
          <p className="oral-topic-meta">{pack.subject} · {pack.level} · ca. {pack.minutes} min</p>
          {pack.description ? <p className="oral-description">{pack.description}</p> : null}
        </section>
        <fieldset className="oral-section oral-goals" aria-describedby="oral-goals-help">
          <legend className="oral-label">Velg målene dine</legend>
          <p className="oral-help" id="oral-goals-help">Velg mellom ett og {LIMITS.goals} mål.</p>
          <div className="oral-goal-list">
            {pack.goals.map((goal, index) => <label key={goal.id} className="oral-goal" data-selected={goalIds.includes(goal.id)}>
              <input type="checkbox" checked={goalIds.includes(goal.id)} onChange={event => setGoalIds(current => event.target.checked ? [...current, goal.id] : current.filter(id => id !== goal.id))} />
              <span className="oral-goal-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{goal.title}</strong><small>{goal.prompt}</small></span>
              <Check size={17} className="oral-goal-check" aria-hidden="true" />
            </label>)}
          </div>
          <p className="oral-selection" role="status">{goalIds.length ? `${goalIds.length} av ${pack.goals.length} mål valgt` : "Velg minst ett mål før du fortsetter."}</p>
        </fieldset>
        <fieldset className="oral-section oral-focus">
          <legend className="oral-label">Hva vil du bli tryggere på?</legend>
          <div className="oral-focus-options">
            {focuses.map(([id, label]) => <label key={id} data-selected={focus === id}><input type="radio" name="oral-focus" value={id} checked={focus === id} onChange={() => setFocus(id)} /><span>{label}</span></label>)}
          </div>
          <label className="oral-request-label" htmlFor="oral-request">Noe spesielt du vil øve på? <span>Valgfritt</span></label>
          <textarea id="oral-request" value={request} onChange={event => setRequest(event.target.value)} maxLength={LIMITS.practiceRequest} rows={3} placeholder="For eksempel: Still meg oppfølgingsspørsmål når jeg forklarer …" aria-describedby="oral-request-help" />
          <p id="oral-request-help" className="oral-help">Ønsket hjelper fagtreneren å tilpasse samtalen. Unngå sensitive personopplysninger.</p>
        </fieldset>
      </fieldset>
      <aside className="oral-companion" aria-label="Slik blir samtalen">
        <div className="oral-companion-art" aria-hidden="true"><span className="oral-orbit" /><BookOpen size={45} strokeWidth={1} /><i /><i /><i /></div>
        <h2>Slik blir samtalen</h2>
        <p className="oral-companion-copy">Fagtreneren stiller oppfølgingsspørsmål. Du kan be om et hint eller prøve på nytt.</p>
        <fieldset className="oral-mode" disabled={busy}>
          <legend>Hvordan vil du øve?</legend>
          {modes.map(option => {
            const enabled = option.id === "avatar" ? integrations.avatar : option.id === "voice" ? integrations.voice : integrations.llm;
            return <label key={option.id} data-selected={mode === option.id} data-disabled={!enabled}><option.icon size={18} /><span><strong>{option.title}</strong><small>{enabled ? option.detail : "Ikke koblet til"}</small></span><input type="radio" name="oral-mode" value={option.id} checked={mode === option.id} disabled={!enabled} onChange={() => setMode(option.id)} /></label>;
          })}
        </fieldset>
        {!available ? <div className="notice warning-notice" role="note"><TriangleAlert size={18} aria-hidden="true" /><span>Samtaletjenesten er ikke koblet til. Du kan gjøre valgene dine, men vi simulerer ikke en samtale.</span></div> : null}
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <button type="submit" className="button primary wide" disabled={busy || !goalIds.length || !available}>{busy ? "Gjør klar fagpraten …" : "Til samtalen"}<ArrowRight size={17} /></button>
        <p className="oral-help oral-mic-note">{mode === "text" ? "Du skriver svarene dine. Ingen mikrofon brukes." : "Du slår på mikrofonen i samtalerommet."}{mode === "avatar" ? ` Avataren varer inntil ${LIMITS.avatarSeconds / 60} minutter i denne demoen.` : ""} Gjennomgangen lagres i Mine økter.</p>
        <div className="oral-sources"><p><LockKeyhole size={13} />Lærerens fagstoff · versjon {pack.version}</p>{pack.sources.map(item => <button key={item.id} type="button" className="text-link" onClick={() => setSource(item)}><FileText size={13} /><span>{item.title} · s. {item.page}</span><ArrowRight size={13} /></button>)}</div>
      </aside>
    </form>}
    <SourceDialog source={source} onClose={() => setSource(null)} />
  </div>;
}
