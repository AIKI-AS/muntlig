"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, AudioLines, Check, FileText, LockKeyhole, MessageSquare, SlidersHorizontal, TriangleAlert, Video } from "lucide-react";
import type { Integrations, Pack, PracticeFocus, PracticeMode, Session, Source } from "@/lib/contracts";
import { message, post } from "@/lib/client-api";
import { LIMITS } from "@/lib/limits";
import { practiceFocusLabels } from "@/lib/practice-plan";
import { Dialog, Empty, ErrorNotice, Heading, SourceDialog } from "./ui";

const focuses = Object.entries(practiceFocusLabels) as [PracticeFocus, string][];
const modes = [
  { id: "avatar", title: "Med fagtrener", detail: `Avatar og tale · maks ${LIMITS.avatarSeconds / 60} min`, icon: Video },
  { id: "voice", title: "Bare tale", detail: "Uten avatarvideo", icon: AudioLines },
  { id: "text", title: "Skriv", detail: "Uten mikrofon", icon: MessageSquare },
] as const;
/** Above this many published topics the chip row becomes a native select. */
const MAX_TOPIC_CHIPS = 5;
/** Decorative sound fan. Deterministic, rounded values so server and client markup match. */
const rays = Array.from({ length: 27 }, (_, index) => {
  const t = (index / 26) * 2 - 1;
  return {
    angle: Math.round(t * 780) / 10,
    length: Math.round(34 + 28 * Math.abs(Math.sin(index * 1.37 + 0.4)) * (1 - 0.3 * Math.abs(t))),
    delay: -Math.round(((index * 0.53) % 4) * 100) / 100,
    tone: index % 3,
  };
});

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startRequest = useRef<AbortController | null>(null);
  useEffect(() => () => startRequest.current?.abort(), []);
  useEffect(() => {
    // Download only: constructors and provider access still wait for the learner's start click.
    if (integrations.avatar) void import("../media/avatar-client").catch(() => undefined);
  }, [integrations.avatar]);
  const available = mode === "avatar" ? integrations.avatar : mode === "voice" ? integrations.voice : integrations.llm;
  function choosePack(id: string) {
    setPackId(id);
    setGoalIds(published.find(pack => pack.id === id)?.goals.map(goal => goal.id) ?? []);
    setError(null);
  }
  async function start(event: FormEvent) {
    event.preventDefault();
    if (!pack || !goalIds.length || !available || busy || startRequest.current) return;
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
      if (startRequest.current === controller) startRequest.current = null;
    }
  }
  if (!pack) return <div className="page oral-page">
    <Heading title="Hva vil du øve på?" />
    <Empty title="Temaene kommer fra læreren din." action={<Link className="button secondary" href="/">Til arbeidsrommet<ArrowRight size={16} /></Link>}>
      Ingen fagpakke er publisert ennå. Når læreren har gjort fagstoffet klart, kan du velge tema her.
    </Empty>
  </div>;
  const modeTitle = modes.find(option => option.id === mode)?.title ?? "";
  const goalSummary = !goalIds.length ? "Ingen mål valgt" : goalIds.length === pack.goals.length ? `Alle ${pack.goals.length} mål` : `${goalIds.length} av ${pack.goals.length} mål`;
  const summary = [goalSummary, practiceFocusLabels[focus], modeTitle, request.trim() ? "eget ønske" : null].filter(Boolean).join(" · ");
  return <div className="page oral-page">
    <form className="oral-start" onSubmit={event => void start(event)} aria-busy={busy}>
      <div className="oral-toolbar">
        <button type="button" className="button secondary oral-settings-button" onClick={() => setSettingsOpen(true)} disabled={busy} aria-haspopup="dialog">
          <SlidersHorizontal size={16} aria-hidden="true" />Innstillinger
        </button>
      </div>
      <div className="oral-sculpture" data-busy={busy} aria-hidden="true">
        {rays.map((ray, index) => <span key={index} className="oral-ray" data-tone={ray.tone} style={{ "--angle": `${ray.angle}deg`, "--len": `${ray.length}%`, "--delay": `${ray.delay}s` } as CSSProperties} />)}
        <span className="oral-core"><AudioLines size={26} strokeWidth={1.6} /></span>
      </div>
      <h1 className="oral-title">Hva vil du øve på?</h1>
      <p className="oral-lede">Velg tema og start. Fagtreneren stiller oppfølgingsspørsmål, og du kan be om hint underveis.</p>
      <fieldset className="oral-topics" disabled={busy}>
        <legend className="sr-only">Tema</legend>
        {published.length > MAX_TOPIC_CHIPS
          ? <>
            <label className="sr-only" htmlFor="oral-topic">Hva vil du snakke om?</label>
            <select id="oral-topic" value={pack.id} onChange={event => choosePack(event.target.value)}>
              {published.map(item => <option key={item.id} value={item.id}>{item.title} · {item.subject}</option>)}
            </select>
          </>
          : <div className="oral-chips" role="presentation">
            {published.map(item => <label key={item.id} data-selected={item.id === pack.id}>
              <input type="radio" name="oral-topic" value={item.id} checked={item.id === pack.id} onChange={() => choosePack(item.id)} />
              <span><strong>{item.title}</strong><small>{item.subject}</small></span>
            </label>)}
          </div>}
        <p className="oral-topic-meta">{pack.subject} · {pack.level} · ca. {pack.minutes} min</p>
        {pack.description ? <p className="oral-description">{pack.description}</p> : null}
      </fieldset>
      {!goalIds.length ? <div className="notice warning-notice" role="note"><TriangleAlert size={18} aria-hidden="true" /><span>Velg minst ett mål i <button type="button" className="oral-inline-link" onClick={() => setSettingsOpen(true)} disabled={busy}>Innstillinger</button> før du starter.</span></div> : null}
      {!available ? <div className="notice warning-notice" role="note"><TriangleAlert size={18} aria-hidden="true" /><span>Samtaletjenesten er ikke koblet til. Du kan gjøre valgene dine, men vi simulerer ikke en samtale.</span></div> : null}
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      <button type="submit" className="button primary oral-start-button" disabled={busy || !goalIds.length || !available}>{busy ? "Gjør klar fagpraten …" : "Start fagpraten"}<ArrowRight size={19} aria-hidden="true" /></button>
      <p className="oral-summary">{summary}</p>
      <p className="oral-help oral-mic-note">{mode === "text" ? "Du skriver svarene dine. Ingen mikrofon brukes." : "Samtalen bruker mikrofonen din."} Gjennomgangen lagres i Mine økter.</p>
    </form>
    <Dialog open={settingsOpen} title="Innstillinger" onClose={() => setSettingsOpen(false)}>
      {settingsOpen ? <>
        <div className="oral-settings">
          <fieldset className="oral-set" aria-describedby="oral-goals-help" disabled={busy}>
            <legend className="oral-label">Mål</legend>
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
          <fieldset className="oral-set oral-focus" disabled={busy}>
            <legend className="oral-label">Hva vil du bli tryggere på?</legend>
            <div className="oral-focus-options">
              {focuses.map(([id, label]) => <label key={id} data-selected={focus === id}><input type="radio" name="oral-focus" value={id} checked={focus === id} onChange={() => setFocus(id)} /><span>{label}</span></label>)}
            </div>
          </fieldset>
          <div className="oral-set">
            <label className="oral-label" htmlFor="oral-request">Noe spesielt du vil øve på? <span className="oral-optional">Valgfritt</span></label>
            <textarea id="oral-request" value={request} onChange={event => setRequest(event.target.value)} maxLength={LIMITS.practiceRequest} rows={3} disabled={busy} placeholder="For eksempel: Still meg oppfølgingsspørsmål når jeg forklarer …" aria-describedby="oral-request-help" />
            <p id="oral-request-help" className="oral-help">Ønsket hjelper fagtreneren å tilpasse samtalen. Unngå sensitive personopplysninger.</p>
          </div>
          <fieldset className="oral-set oral-mode" disabled={busy}>
            <legend className="oral-label">Hvordan vil du øve?</legend>
            {modes.map(option => {
              const enabled = option.id === "avatar" ? integrations.avatar : option.id === "voice" ? integrations.voice : integrations.llm;
              return <label key={option.id} data-selected={mode === option.id} data-disabled={!enabled}><option.icon size={18} aria-hidden="true" /><span><strong>{option.title}</strong><small>{enabled ? option.detail : "Ikke koblet til"}</small></span><input type="radio" name="oral-mode" value={option.id} checked={mode === option.id} disabled={!enabled} onChange={() => setMode(option.id)} /></label>;
            })}
          </fieldset>
          <div className="oral-set oral-sources">
            <p><LockKeyhole size={13} aria-hidden="true" />Lærerens fagstoff · versjon {pack.version}</p>
            {pack.sources.map(item => <button key={item.id} type="button" className="text-link" onClick={() => setSource(item)}><FileText size={13} aria-hidden="true" /><span>{item.title} · s. {item.page}</span><ArrowRight size={13} aria-hidden="true" /></button>)}
          </div>
        </div>
        <div className="oral-settings-foot">
          <p className="oral-summary" aria-live="polite">{summary}</p>
          <button type="button" className="button primary" onClick={() => setSettingsOpen(false)}>Ferdig</button>
        </div>
      </> : null}
    </Dialog>
    <SourceDialog source={source} onClose={() => setSource(null)} />
  </div>;
}
