"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Conversation, type MessagePayload, type VoiceConversation } from "@elevenlabs/client";
import type { Session, Turn } from "@/lib/contracts";
import { parseRecordEvidence, parseShowGoal, RECORD_EVIDENCE_TOOL, SHOW_GOAL_TOOL, type ConversationAccess } from "@/lib/conversation";
import { practiceGoals } from "@/lib/practice-plan";
import { message, post } from "@/lib/client-api";
import { useAvatar } from "./use-avatar";

type CallState = "idle" | "preparing" | "connecting" | "connected" | "ended";
const EMPTY_FREQUENCY = new Uint8Array(0);
const SDK_DOMAINS = { us: "elevenlabs.io", global: "elevenlabs.io", "eu-residency": "eu.residency.elevenlabs.io", "in-residency": "in.residency.elevenlabs.io" };

function mergeTurns(previous: Turn[], updates: Turn[]) {
  const turns = new Map(previous.map((turn) => [turn.id, turn]));
  for (const turn of updates) turns.set(turn.id, turn);
  return [...turns.values()];
}

export function usePracticeConversation(session: Session, videoRef: RefObject<HTMLVideoElement | null>) {
  const avatarMode = session.mode === "avatar";
  const connection = useRef<VoiceConversation | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const starting = useRef<number | null>(null);
  const expectedId = useRef<string | null>(null);
  const accessRequested = useRef(false);
  const currentGoal = useRef(session.activeGoalId);
  const micMuted = useRef(false);
  const [state, setState] = useState<CallState>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(session.turns);
  const pendingTurns = useRef<Turn[]>([]);
  const revealedTurns = useRef(new Set(session.turns.map((turn) => turn.id)));
  const lastSpeech = useRef<string | null>(null);
  const awaitingText = useRef(false);
  const [goalId, setGoalId] = useState(session.activeGoalId);
  const [error, setError] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const publish = useCallback((updates: Turn[]) => {
    if (!mounted.current || !updates.length) return;
    for (const turn of updates) revealedTurns.current.add(turn.id);
    setTurns((previous) => mergeTurns(previous, updates));
  }, []);
  const flushPending = useCallback(() => {
    const pending = pendingTurns.current;
    pendingTurns.current = [];
    awaitingText.current = false;
    publish(pending);
  }, [publish]);
  const avatar = useAvatar({ sessionId: session.id, scope: `${session.id}:${session.mode}:${session.status}`, videoRef, onError: fail, onSpeechStart: revealSpeech });
  const stopAvatar = avatar.stop;

  useEffect(() => {
    // Download browser code only; provider sessions still require a click and microphone permission.
    if (avatarMode) void import("./avatar-client").catch(() => undefined);
  }, [avatarMode]);

  const stop = useCallback(async () => {
    generation.current++;
    starting.current = null;
    const call = connection.current;
    connection.current = null;
    flushPending();
    if (mounted.current) {
      setState(expectedId.current || accessRequested.current ? "ended" : "idle");
      setSpeaking(false);
    }
    await Promise.allSettled([call?.endSession(), stopAvatar()]);
  }, [stopAvatar, flushPending]);

  useEffect(() => {
    mounted.current = true;
    const onHide = () => { void stop(); };
    window.addEventListener("pagehide", onHide);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", onHide);
      void stop();
    };
  }, [stop]);

  function fail(text: string) {
    if (!mounted.current) return;
    setError(text);
    setState(expectedId.current || accessRequested.current ? "ended" : "idle");
    setSpeaking(false);
    void stop();
  }

  function receive(payload: MessagePayload) {
    if (!mounted.current || !payload.message.trim()) return;
    const id = `${payload.role}:${payload.event_id}`;
    const turn: Turn = {
      id, role: payload.role === "user" ? "user" : "assistant", text: payload.message,
      sourceIds: [], goalId: currentGoal.current,
      at: new Date().toISOString(), hint: false,
    };
    if (avatarMode && turn.role === "assistant" && !revealedTurns.current.has(id)) {
      if (!awaitingText.current) {
        pendingTurns.current = mergeTurns(pendingTurns.current, [turn]);
        return;
      }
      awaitingText.current = false;
    } else if (turn.role === "user") {
      flushPending();
    }
    publish([turn]);
  }

  function revealSpeech(utteranceId: string) {
    // One utterance can report multiple starts; never consume the next response twice.
    if (lastSpeech.current === utteranceId) return;
    lastSpeech.current = utteranceId;
    const turn = pendingTurns.current.shift();
    awaitingText.current = !turn;
    if (turn) publish([turn]);
  }

  async function start() {
    if (starting.current !== null || connection.current || expectedId.current || accessRequested.current || state === "ended") return;
    const mine = ++generation.current;
    starting.current = mine;
    const active = () => mounted.current && mine === generation.current;
    setError(null);
    setState("preparing");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Nettleseren gir ikke tilgang til mikrofon. Bruk HTTPS eller lokal utvikling.");
      // Ask before obtaining paid provider access. Only ElevenLabs keeps a microphone open.
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      permission.getTracks().forEach((track) => track.stop());
      if (!active()) return;
      if (avatarMode && !await avatar.start()) return;
      if (!active()) { await stopAvatar(); return; }
      setState("connecting");
      accessRequested.current = true;
      const access = await post<ConversationAccess>(`/api/sessions/${session.id}/conversation`);
      expectedId.current = access.conversationId;
      if (!active()) return;
      if (avatarMode && access.connectionType !== "websocket") throw new Error("Avataren krever en tapsfri lydforbindelse.");
      const domain = SDK_DOMAINS[access.serverLocation];
      // Tool calls follow the session plan; the immutable published pack remains complete.
      const planned = { goals: practiceGoals(session) };
      const transport = access.connectionType === "websocket"
        ? { signedUrl: access.signedUrl, connectionType: "websocket" as const }
        : { conversationToken: access.conversationToken, connectionType: "webrtc" as const };
      const call = await Conversation.startSession({
        ...transport, origin: `wss://api.${domain}`, livekitUrl: `wss://livekit.rtc.${domain}`,
        onConversationCreated: (created) => {
          // Mute before SDK callbacks or queued audio: LiveAvatar is the only audible output in avatar mode.
          created.setVolume({ volume: avatarMode ? 0 : 1 });
          if (!active() || created.type !== "voice") { void created.endSession(); return; }
          connection.current = created;
        },
        onConnect: ({ conversationId }) => {
          if (!active()) return;
          if (conversationId !== expectedId.current) { fail("Samtalen stemmer ikke med denne økten. Avslutt og åpne gjennomgangen."); return; }
          setState("connected");
          setConnectedAt(Date.now());
        },
        onDisconnect: (details) => {
          if (!active()) return;
          flushPending();
          connection.current = null;
          setState("ended");
          setSpeaking(false);
          void stopAvatar();
          if (details.reason === "error") setError("Forbindelsen ble brutt. Avslutt økten for å hente det som faktisk ble sagt.");
        },
        onError: () => { if (active()) fail("ElevenLabs-samtalen fikk en feil. Avslutt økten for å hente gjennomgangen."); },
        onMessage: (payload) => { if (active()) receive(payload); },
        onAudio: (pcm) => {
          if (!active() || !avatarMode) return;
          try {
            const live = avatar.avatar.current?.avatar;
            if (!live) throw new Error("Avataren er ikke tilkoblet.");
            live.appendAudio(pcm);
          } catch { fail("Lydstrømmen til avataren ble brutt. Avslutt økten for å hente gjennomgangen."); }
        },
        onInterruption: () => {
          if (!active()) return;
          flushPending();
          try { avatar.avatar.current?.avatar.interrupt(); }
          catch { fail("Avataren kunne ikke avbrytes. Samtalen er stoppet."); }
        },
        onModeChange: ({ mode }) => {
          if (!active()) return;
          setSpeaking(mode === "speaking");
          try {
            const live = avatar.avatar.current?.avatar;
            if (mode === "listening") live?.endAudio();
            live?.listening(mode === "listening" && !micMuted.current);
          } catch { fail("Forbindelsen til avataren ble brutt. Avslutt økten for å hente gjennomgangen."); }
        },
        onAgentResponseCorrection: (correction) => {
          if (!active()) return;
          pendingTurns.current = pendingTurns.current.map((turn) => turn.id === `agent:${correction.event_id}`
            ? { ...turn, text: correction.corrected_agent_response } : turn);
          setTurns((previous) => previous.map((turn) => turn.id === `agent:${correction.event_id}`
            ? { ...turn, text: correction.corrected_agent_response } : turn));
        },
        clientTools: {
          [SHOW_GOAL_TOOL]: (parameters: unknown) => {
            const next = parseShowGoal(parameters, planned);
            if (!active() || !next) return "Ugyldig mål. Bruk bare målene eleven har valgt.";
            currentGoal.current = next.goalId;
            setGoalId(next.goalId);
            return "Målet vises på fagtavla. Dette er en foreløpig visning, ikke lagret evidens.";
          },
          [RECORD_EVIDENCE_TOOL]: (parameters: unknown) => parseRecordEvidence(parameters, planned)
            ? "Gjennomgangen validerer sitatet mot leverandørens transkript etter økten."
            : "Ugyldig mål, sitat eller kildehenvisning. Ingen evidens er registrert.",
        },
      });
      if (!active() || call.type !== "voice" || call.getId() !== expectedId.current) { await call.endSession(); return; }
      connection.current = call;
    } catch (failure) {
      if (active()) {
        setError(failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Mikrofontilgang ble ikke gitt. Tillat mikrofonen før du starter samtalen."
          : expectedId.current ? "Samtalen kunne ikke kobles til. Avslutt økten for å hente eventuell gjennomgang." : message(failure));
        setState(expectedId.current || accessRequested.current ? "ended" : "idle");
        await stopAvatar();
      }
    } finally { if (starting.current === mine) starting.current = null; }
  }

  function toggleMuted() {
    if (!connection.current) return;
    micMuted.current = !micMuted.current;
    connection.current.setMicMuted(micMuted.current);
    setMuted(micMuted.current);
    try { avatar.avatar.current?.avatar.listening(!micMuted.current && !speaking); }
    catch { fail("Avataren mistet forbindelsen. Samtalen er stoppet."); }
  }
  function send(text: string) {
    if (connection.current && text.trim()) connection.current.sendUserMessage(text.trim());
  }
  const readFrequency = useCallback(() => {
    const call = connection.current;
    return !call ? EMPTY_FREQUENCY : speaking ? call.getOutputByteFrequencyData() : muted ? EMPTY_FREQUENCY : call.getInputByteFrequencyData();
  }, [speaking, muted]);
  return { state, speaking: avatarMode ? avatar.speaking : speaking, muted, turns, goalId, error, connectedAt,
    waitingForSpeech: avatarMode && speaking && !avatar.speaking,
    start, stop, toggleMuted, send, readFrequency, avatarPhase: avatar.phase,
    audioBlocked: avatar.audioBlocked, enableAudio: avatar.enableAudio,
    typing: () => connection.current?.sendUserActivity() };
}
