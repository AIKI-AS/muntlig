"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, AudioLines, BookOpen, ChevronRight, FileText, Flag, GitBranch, LockKeyhole, MessageSquare, Mic, Send, Target, TriangleAlert, Video, Volume2, X } from "lucide-react";
import type { Review, Session, Source } from "@/lib/contracts";
import { api, ApiError, message } from "@/lib/client-api";
import { LIMITS } from "@/lib/limits";
import { practiceFocusLabels, practiceGoals } from "@/lib/practice-plan";
import { usePracticeConversation } from "@/features/media/use-conversation";
import { VoiceSignal } from "@/features/media/voice-signal";
import { Dialog, ErrorNotice, SourceDialog } from "./ui";

export function VoicePractice({ session, onFinish }: { session: Session; onFinish: (review: Review) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null);
  const call = usePracticeConversation(session, video);
  const avatarMode = session.mode === "avatar";
  const finishRequest = useRef<AbortController | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [boardTab, setBoardTab] = useState<"goal" | "source" | "map">("goal");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [savedReview, setSavedReview] = useState<Review | null>(null);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const connected = call.state === "connected";
  const connecting = call.state === "preparing" || call.state === "connecting";
  const goals = practiceGoals(session);
  const goalIndex = Math.max(0, goals.findIndex((item) => item.id === call.goalId));
  const goal = goals[goalIndex];
  const sources = session.pack.sources.filter((item) => goal.sourceIds.includes(item.id));
  const latest = call.turns.at(-1);
  const stateLabel = call.state === "idle" ? "Klar når du er" : call.state === "preparing" ? call.avatarPhase === "starting" ? "Kobler til HeyGen LiveAvatar" : "Venter på mikrofontilgang" : call.state === "connecting" ? "Kobler til ElevenLabs" : call.state === "ended" ? "Samtalen er avsluttet" : call.speaking ? "Fagtreneren snakker" : call.waitingForSpeech ? "Fagtreneren gjør svaret klart" : call.muted ? "Mikrofonen er av" : "Fagtreneren lytter";
  useEffect(() => () => finishRequest.current?.abort(), []);
  useEffect(() => {
    if (!connected || !call.connectedAt) return;
    const update = () => setElapsed(Math.floor((Date.now() - call.connectedAt!) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [connected, call.connectedAt]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [call.turns.length, transcriptOpen]);
  async function finish() {
    const controller = new AbortController();
    finishRequest.current = controller;
    setFinishing(true);
    setFinishError(null);
    try {
      await call.stop();
      for (let attempt = 0; attempt < 4; attempt++) {
        if (controller.signal.aborted) return;
        try {
          const review = await api<Review>(`/api/sessions/${session.id}/finish`, { method: "POST", signal: controller.signal });
          await onFinish(review);
          return;
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 425 || attempt === 3) throw failure;
          setProcessing(true);
          await new Promise((resolve) => window.setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      const waiting = failure instanceof ApiError && failure.status === 425;
      setProcessing(waiting);
      setFinishError(message(failure));
      // The transcript may already be saved when only the ElevenLabs cleanup failed: look the stored review up (read-only GET) so the dialog can open it.
      const stored = waiting ? null : await api<Review>(`/api/sessions/${session.id}/review`, { signal: controller.signal }).catch(() => null);
      if (stored?.session.status === "completed" && !controller.signal.aborted) setSavedReview(stored);
    } finally { if (!controller.signal.aborted) setFinishing(false); }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !connected) return;
    call.send(answer);
    setAnswer("");
    input.current?.focus();
  }
  async function cancelStart() {
    await call.stop();
    startButton.current?.focus();
  }
  return <div className="voice-practice-page">
    <header className="voice-room-header">
      <Link href="/" className="voice-back icon-button" aria-label="Til arbeidsrommet" title="Til arbeidsrommet"><ArrowLeft size={19} /></Link>
      <div><span className="voice-room-subject">{session.pack.subject} <span> / </span> {session.pack.level}</span><h1>{session.pack.title}</h1></div>
      <span className="voice-version" title="Økten bruker denne låste fagpakkeversjonen"><LockKeyhole size={13} /> v{session.packVersion}</span>
      <button className="button secondary voice-finish" onClick={() => setConfirmFinish(true)} disabled={finishing || connecting} aria-label="Avslutt økten" title="Avslutt økten"><Flag size={15} /><span>Avslutt</span></button>
    </header>
    <div className="voice-room-grid">
      <section className="voice-room-main" aria-label={avatarMode ? "Fagpraten med HeyGen LiveAvatar og ElevenLabs" : "ElevenLabs-fagpraten"}>
        <p className="voice-current-goal" aria-live="polite"><span>Vi snakker om</span><strong>{goal.title}</strong></p>
        <div className="voice-stage" data-state={call.state} data-avatar={avatarMode}>
          <div className="voice-stage-top"><span>{avatarMode ? <Video size={14} /> : <AudioLines size={14} />} FAGPRAT{avatarMode ? ` · maks ${LIMITS.avatarSeconds / 60} min` : ""}</span><span className="voice-timer" aria-label="Tid i tilkoblet samtale">{String(Math.floor(elapsed / 60)).padStart(2, "0")}<span>:</span>{String(elapsed % 60).padStart(2, "0")}</span></div>
          {avatarMode ? <div className="voice-avatar-frame" data-ready={call.avatarPhase === "ready"}>
            <video ref={video} autoPlay playsInline aria-label="Digital fagtrener fra HeyGen LiveAvatar" />
            {call.avatarPhase !== "ready" ? <div className="voice-avatar-wait"><Video size={30} strokeWidth={1.2} /><span>{call.avatarPhase === "starting" ? "Henter fagtreneren …" : call.state === "ended" ? "Avatarvideoen er avsluttet" : "Avataren vises når du starter"}</span><small>HeyGen LiveAvatar · ElevenLabs-stemme</small></div> : null}
            {call.audioBlocked ? <button className="button secondary voice-enable-audio" onClick={call.enableAudio}><Volume2 size={16} />Slå på avatarens lyd</button> : null}
          </div> : <VoiceSignal active={connected} speaking={call.speaking} readFrequency={call.readFrequency} />}
          <div className="voice-state-label" role="status"><i data-live={connected && !call.muted} />{stateLabel}</div>
          <div className="voice-stage-copy">
            {call.state === "idle" ? <><h2>Ta ordet.</h2><p>Start mikrofonen når du er klar.<br />Du kan tenke høyt, spørre og ombestemme deg.</p></> : connecting ? <><h2>Gjør plass til en fagprat.</h2><p>Mikrofonen kobles til først etter ditt klikk.</p></> : call.state === "ended" ? <><h2>Dine ord er utgangspunktet.</h2><p>Avslutt økten for å hente sitater og kilder<br />fra den faktiske samtalen.</p></> : <div className="voice-live-quote" aria-live="off"><span>{latest?.role === "user" ? "DINE ORD" : "FAGTRENEREN"}</span><p>{latest?.text ?? "Samtalen er tilkoblet. Fagtreneren begynner."}</p></div>}
          </div>
          {call.error ? <ErrorNotice>{call.error}</ErrorNotice> : null}
          <div className="voice-call-controls">
            {call.state === "idle" || connecting ? <><button ref={startButton} className="voice-start-button" onClick={() => void call.start()} disabled={connecting || finishing}><Mic size={19} /><span>{connecting ? "Kobler til …" : "Start samtalen"}</span><ArrowRight size={17} /></button>{connecting ? <button className="voice-tool" onClick={() => void cancelStart()} aria-label="Avbryt oppstart" title="Avbryt oppstart"><X size={21} /></button> : null}</> : call.state === "ended" ? <button ref={startButton} className="voice-start-button" onClick={() => setConfirmFinish(true)} disabled={finishing}><BookOpen size={18} /><span>Se gjennomgangen</span><ArrowRight size={17} /></button> : <>
              <button className="voice-tool voice-mic-control" onClick={call.toggleMuted} aria-label="Mikrofon" aria-pressed={!call.muted} title={call.muted ? "Slå på mikrofonen" : "Slå av mikrofonen"}><span className="morph-mic" data-muted={call.muted}><Mic size={23} /><i /></span></button>
              <button className="voice-tool" onClick={() => { setShowComposer(!showComposer); setTranscriptOpen(true); }} aria-label="Skrivefelt" aria-pressed={showComposer} title="Skriv et svar"><MessageSquare size={21} /></button>
              <button className="voice-tool voice-end-control" onClick={() => setConfirmFinish(true)} aria-label="Avslutt samtalen" title="Avslutt samtalen"><X size={21} /></button>
            </>}
          </div>
          <span className="voice-provider-label">{avatarMode ? "HeyGen LiveAvatar + ElevenLabs" : "Tale med ElevenLabs"} <span>·</span> Vi lagrer ikke rålyd eller avatarvideo</span>
        </div>
        <div className="voice-transcript-section">
          <button className="voice-transcript-toggle" onClick={() => setTranscriptOpen(!transcriptOpen)} aria-expanded={transcriptOpen} aria-controls="voice-transcript"><MessageSquare size={16} /><span>Samtalen i tekst</span><span className="voice-message-count">{call.turns.length}</span><ChevronRight size={16} /></button>
          <div id="voice-transcript" hidden={!transcriptOpen}>
            <div className="voice-transcript" ref={log} role="log" aria-label="Foreløpig samtaletekst" aria-live="polite" aria-relevant="additions text">
              {call.turns.length ? call.turns.map((turn) => <article className={"voice-message " + turn.role} key={turn.id}><span>{turn.role === "user" ? "Du" : "Fagtreneren"}</span><p>{turn.text}</p></article>) : <p className="voice-transcript-empty">Samtalen vises her når den har startet.</p>}
            </div>
            <p className="voice-preview-note">Foreløpig tekst. Gjennomgangen kontrolleres mot ElevenLabs-transkriptet når økten avsluttes.</p>
          </div>
          {showComposer ? <form className="voice-composer" onSubmit={send}><label htmlFor="voice-written-answer" className="sr-only">Skriv til fagtreneren</label><textarea id="voice-written-answer" ref={input} value={answer} onChange={(event) => { setAnswer(event.target.value); call.typing(); }} placeholder="Forklar med egne ord …" maxLength={LIMITS.answer} rows={2} disabled={!connected || finishing} /><button className="send-button" type="submit" disabled={!answer.trim() || !connected || finishing} aria-label="Send svaret"><Send size={18} /></button></form> : null}
        </div>
      </section>
      <details className="voice-study-section">
        <summary><BookOpen size={16} /><span>Fagstoff og mål</span><ChevronRight size={16} /></summary>
        <aside className="voice-board" aria-label="Kildebundet fagstoff">
        <header className="voice-board-header"><div><h2>Øvingsplanen</h2><span>{practiceFocusLabels[session.plan.focus]}</span></div><span className="voice-board-index">{String(goalIndex + 1).padStart(2, "0")}<span> / {String(goals.length).padStart(2, "0")}</span></span></header>
        <ol className="voice-goal-track" aria-label="Målene i økten" style={{ gridTemplateColumns: `repeat(${goals.length}, minmax(0, 1fr))` }}>
          {goals.map((item, index) => <li key={item.id} data-current={index === goalIndex} aria-current={index === goalIndex ? "true" : undefined}>
            <span className="voice-track-dot"><span>{String(index + 1).padStart(2, "0")}</span></span>
            <span>{item.title}</span>
          </li>)}
        </ol>
        <div className="voice-board-tabs" role="group" aria-label="Velg tavlevisning">{([{ id: "goal", label: "Mål", icon: Target }, { id: "source", label: "Kilder", icon: FileText }, { id: "map", label: "Koblinger", icon: GitBranch }] as const).map((tab) => <button key={tab.id} onClick={() => setBoardTab(tab.id)} aria-pressed={boardTab === tab.id}><tab.icon size={15} /><span>{tab.label}</span></button>)}</div>
        <div className="voice-board-content">
          {boardTab === "goal" ? <><span className="voice-board-overline">DETTE UTFORSKER DERE</span><h3>{goal.title}</h3><p className="voice-goal-prompt">{goal.prompt}</p><div className="voice-board-rule" /><span className="voice-board-overline">FORANKRET I {sources.length === 1 ? "ÉN KILDE" : `${sources.length} KILDER`}</span>{sources.map((item) => <button className="voice-source-link" key={item.id} onClick={() => setSource(item)}><FileText size={17} /><span>{item.title}<small>Side {item.page}</small></span><ChevronRight size={15} /></button>)}</> : null}
          {boardTab === "source" ? <><span className="voice-board-overline">LÆRERENS FAGSTOFF</span>{sources.map((item) => <article className="voice-source-card" key={item.id}><header><FileText size={16} /><span>{item.title}</span><small>s. {item.page}</small></header><p>{item.text}</p><button onClick={() => setSource(item)}>Les kildeutdraget<ArrowRight size={14} /></button></article>)}</> : null}
          {boardTab === "map" ? <><span className="voice-board-overline">GODKJENTE KOBLINGER</span><div className="voice-map"><div className="voice-map-goal"><Target size={19} /><strong>{goal.title}</strong></div><div className="voice-map-branches">{sources.map((item) => <button key={item.id} onClick={() => setSource(item)}><FileText size={17} /><span>{item.title}<small>Side {item.page}</small></span></button>)}</div></div><p className="voice-preview-note">Koblingene kommer fra lærerens låste fagpakke, ikke fra oppdiktet fagstoff.</p></> : null}
        </div>
        <footer className="voice-board-foot"><LockKeyhole size={13} /><span>Fagpakke v{session.packVersion} · {goals.length} valgte mål<br />Et vist mål er ikke automatisk undersøkt.</span></footer>
        </aside>
      </details>
    </div>
    <SourceDialog source={source} onClose={() => setSource(null)} />
    <Dialog open={confirmFinish} onClose={() => { if (!finishing) setConfirmFinish(false); }} title={savedReview ? "Gjennomgangen er lagret" : processing ? "Gjennomgangen gjøres klar" : "Samle dine egne forklaringer?"}>
      <p>{savedReview ? savedReview.cleanupPending ? "Samtalen er avsluttet og gjennomgangen din er lagret, men den midlertidige ElevenLabs-agenten er ikke ryddet. Åpne gjennomgangen og bruk «Prøv opprydding igjen»." : "Samtalen er avsluttet og gjennomgangen din er lagret." : processing ? "Samtalen er avsluttet. ElevenLabs behandler transkriptet før vi kan kontrollere sitater og kilder." : "Mikrofonen kobles fra. Vi henter det som faktisk ble sagt og lar uundersøkte mål stå åpne."}</p>
      {answer.trim() ? <p className="notice warning-notice"><TriangleAlert size={18} aria-hidden="true" /><span>Du har tekst som ikke er sendt. Den blir ikke med i gjennomgangen.</span></p> : null}
      {finishError ? <ErrorNotice>{finishError}</ErrorNotice> : null}
      <div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmFinish(false)} disabled={finishing}>{call.state === "ended" ? "Lukk" : "Fortsett økten"}</button>{savedReview ? <button className="button primary" onClick={() => void onFinish(savedReview)} disabled={finishing}>Åpne gjennomgangen<ArrowRight size={16} /></button> : <button className="button primary" onClick={() => void finish()} disabled={finishing}>{finishing ? "Kontrollerer samtalen …" : processing ? "Hent gjennomgangen igjen" : "Avslutt og se gjennomgang"}<ArrowRight size={16} /></button>}</div>
    </Dialog>
  </div>;
}
