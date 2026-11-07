import { LiveAvatarSession, SessionEvent } from '@heygen/liveavatar-web-sdk';
import type { AvatarCredentials } from './types';
import { AvatarAudioStream } from './avatar-audio';

/**
 * LiveAvatar Lite in the browser. The SDK (0.0.20) starts the session with the session-scoped token, joins the
 * LiveKit room for video and opens the command websocket. We then drive that websocket with the documented Lite
 * commands (agent.speak / agent.speak_end / agent.interrupt / session.keep_alive) because repeatAudio
 * ends each input chunk as a separate utterance and does not wait for session.state_updated = connected.
 * Docs: https://docs.liveavatar.com/docs/lite-mode/lifecycle.md and https://docs.liveavatar.com/docs/lite-mode/events.md
 * The SDK is dynamically imported in the browser. Only ElevenLabs owns the microphone;
 * LiveAvatar receives the same PCM stream and returns the synchronized video and audio.
 */

const CONNECT_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_MS = 60_000;
// SDK start() cannot be aborted. Its late cleanup must finish before another start may capture audio.
let pendingStart: Promise<void> = Promise.resolve();

export type AvatarEvents = {
  speaking: (speaking: boolean, utteranceId?: string) => void;
  closed: (message: string) => void;
  failure: (message: string) => void;
};

/** The SDK keeps the Lite websocket protected; subclassing is the only supported way to reach it. */
class LiteSession extends LiveAvatarSession {
  readonly commandReady: Promise<void>;
  commandConnected = false;

  constructor(token: string) {
    super(token, { voiceChat: { defaultMuted: true } });
    let ready: () => void = () => undefined;
    this.commandReady = new Promise<void>((resolve) => { ready = resolve; });
    let socket = this._sessionEventSocket;
    const receive = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data);
        if (message.type !== 'session.state_updated') return;
        this.commandConnected = message.state === 'connected';
        if (this.commandConnected) ready();
      } catch { /* Ignore non-JSON provider messages. */ }
    };
    // SDK start() awaits microphone publication after opening the socket. Capture its
    // ready message immediately, not after start() resolves and the message is lost.
    Object.defineProperty(this, '_sessionEventSocket', {
      get: () => socket,
      set: (next: WebSocket | null) => {
        socket?.removeEventListener('message', receive);
        socket = next;
        socket?.addEventListener('message', receive);
      },
    });
  }

  get socket(): WebSocket | null {
    return this._sessionEventSocket;
  }
}

function within<T>(promise: Promise<T>, ms: number, message: string, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const clear = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { clear(); reject(signal.reason); };
    const timer = window.setTimeout(() => { clear(); reject(new Error(message)); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(
      (value) => { clear(); resolve(value); },
      (error: unknown) => { clear(); reject(error); },
    );
  });
}


export class LiteAvatar {
  private connected = false;
  private closed = false;
  private stopped = false;
  private readonly audio = new AvatarAudioStream((command) => this.send(command));
  private readonly heartbeat: number;

  private constructor(
    private readonly session: LiteSession,
    private readonly socket: WebSocket,
    private readonly events: AvatarEvents,
  ) {
    socket.addEventListener('message', this.onMessage);
    socket.addEventListener('close', this.onClosed);
    this.heartbeat = window.setInterval(() => {
      try { this.send({ type: 'session.keep_alive' }); }
      catch { this.shutdown('Avataren mistet forbindelsen. Avslutt økten for å hente gjennomgangen.'); }
    }, KEEP_ALIVE_MS);
  }

  /** Starts the session and resolves only when video+audio are in the room and the websocket reports `connected`. */
  static async connect(credentials: AvatarCredentials, video: HTMLVideoElement, events: AvatarEvents, signal: AbortSignal): Promise<LiteAvatar> {
    const session = new LiteSession(credentials.sessionToken);
    // LITE consumes external PCM. The SDK otherwise captures and publishes a second, unused microphone.
    session.voiceChat.start = async () => undefined;
    const streamReady = new Promise<void>((resolve) => session.once(SessionEvent.SESSION_STREAM_READY, resolve));
    let avatar: LiteAvatar | null = null;
    let retired = false;
    const started = pendingStart.then(async () => {
      signal.throwIfAborted();
      if (retired) throw new Error('Avataroppstarten er avbrutt.');
      try {
        await session.start();
      } finally {
        // This runs even if our timeout/cancel has already returned while SDK start() was pending.
        session.voiceChat.stop();
        if (retired || signal.aborted) await session.stop().catch(() => undefined);
      }
    });
    pendingStart = started.then(() => undefined, () => undefined);
    try {
      // The SDK never rejects when the websocket cannot open, so the whole start is bounded.
      await within(started, CONNECT_TIMEOUT_MS, 'Avataren svarte ikke i tide.', signal);
      signal.throwIfAborted();
      const socket = session.socket;
      if (!socket) throw new Error('Avataren ga ingen kommandokanal.');
      // Readiness is retained even when it arrived during the SDK's microphone setup.
      avatar = new LiteAvatar(session, socket, events);
      session.on(SessionEvent.SESSION_DISCONNECTED, () => avatar?.shutdown('Avataren er koblet fra.'));
      await within(Promise.all([streamReady, session.commandReady]), CONNECT_TIMEOUT_MS, 'Avataren ble ikke klar i tide.', signal);
      if (!session.commandConnected || socket.readyState !== WebSocket.OPEN) throw new Error('Avataren er ikke tilkoblet.');
      avatar.connected = true;
      signal.throwIfAborted();
      session.attach(video);
      return avatar;
    } catch (error) {
      retired = true;
      if (avatar) await avatar.stop();
      else await session.stop().catch(() => undefined);
      throw error;
    }
  }

  private readonly onMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') return;
    let message: { type?: unknown; state?: unknown; source_event_id?: unknown; error?: { type?: unknown } };
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const ours = this.audio.utteranceId !== null && message.source_event_id === this.audio.utteranceId;
    if (message.type === 'session.state_updated') {
      this.connected = message.state === 'connected';
      if (message.state === 'disconnected') this.shutdown('Avataren er koblet fra.');
    } else if (message.type === 'agent.speak_started' && ours) {
      this.events.speaking(true, this.audio.utteranceId ?? undefined);
    } else if ((message.type === 'agent.speak_ended' || message.type === 'agent.speak_interrupted') && ours) {
      this.events.speaking(false);
    } else if (message.type === 'error' && message.error?.type !== 'video_starvation') {
      this.events.failure('Avataren rapporterte en feil. Bruk tekst eller lyd i stedet.');
    }
  };

  private send(command: Record<string, string>) {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) throw new Error('Avataren er ikke tilkoblet.');
    this.socket.send(JSON.stringify(command));
  }

  /** Receives untouched PCM16 mono 24 kHz from the ElevenLabs WebSocket callback. */
  appendAudio(base64: string) {
    if (!this.connected || this.closed) throw new Error('Avataren er ikke klar.');
    this.audio.append(base64);
  }

  endAudio() {
    if (this.connected && !this.closed) this.audio.commit();
  }

  /** Barge-in: clears buffered audio and seals the current utterance. */
  interrupt() {
    if (!this.connected || this.closed) return;
    this.audio.interrupt();
    this.events.speaking(false);
  }

  /** Mirrors the real recording state in the avatar pose. */
  listening(on: boolean) {
    if (!this.connected || this.closed) return;
    this.send({ type: on ? 'agent.start_listening' : 'agent.stop_listening', event_id: crypto.randomUUID() });
  }

  private readonly onClosed = () => this.shutdown('Avataren mistet forbindelsen.');

  private shutdown(message: string) {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.heartbeat);
    this.socket.removeEventListener('message', this.onMessage);
    this.socket.removeEventListener('close', this.onClosed);
    this.events.speaking(false);
    this.events.closed(message);
    void this.stop();
  }

  /** Ends the session. The SDK stops the provider session with the session token; the caller also releases it server-side. */
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.closed = true;
    window.clearInterval(this.heartbeat);
    this.socket.removeEventListener('message', this.onMessage);
    this.socket.removeEventListener('close', this.onClosed);
    const stopping = this.session.stop().catch(() => undefined);
    pendingStart = Promise.all([pendingStart, stopping]).then(() => undefined);
    await stopping;
  }
}
