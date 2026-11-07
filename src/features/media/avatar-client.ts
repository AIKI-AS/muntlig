import { LiveAvatarSession, SessionEvent } from '@heygen/liveavatar-web-sdk';
import type { AvatarCredentials } from './types';

/**
 * LiveAvatar Lite in the browser. The SDK (0.0.20) starts the session with the session-scoped token, joins the
 * LiveKit room for video and opens the command websocket. We then drive that websocket with the documented Lite
 * commands (agent.speak / agent.speak_end / agent.interrupt / session.keep_alive) because the SDK's own
 * repeatAudio sends 20 ms chunks and does not wait for session.state_updated = connected.
 * Docs: https://docs.liveavatar.com/docs/lite-mode/lifecycle.md and https://docs.liveavatar.com/docs/lite-mode/events.md
 * The SDK is imported only from a dynamic import in the browser. It never requests the microphone here
 * because no `voiceChat` option is passed; recording is our own explicit Recorder.
 */

const CONNECT_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_MS = 60_000;
const CHUNK_BYTES = 48_000; // 1 s of PCM16 mono at 24 kHz, the recommended chunk size; well below the 1 MB packet limit

export type AvatarEvents = {
  speaking: (speaking: boolean) => void;
  closed: (message: string) => void;
  failure: (message: string) => void;
};

/** The SDK keeps the Lite websocket protected; subclassing is the only supported way to reach it. */
class LiteSession extends LiveAvatarSession {
  get socket(): WebSocket | null {
    return this._sessionEventSocket;
  }
}

function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x4000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x4000));
  return btoa(binary);
}

export class LiteAvatar {
  private connected = false;
  private closed = false;
  private utterance: string | null = null;
  private readonly heartbeat: number;
  private markReady: () => void = () => undefined;
  private readonly ready = new Promise<void>((resolve) => { this.markReady = resolve; });

  private constructor(
    private readonly session: LiteSession,
    private readonly socket: WebSocket,
    private readonly events: AvatarEvents,
  ) {
    socket.addEventListener('message', this.onMessage);
    this.heartbeat = window.setInterval(() => this.send({ type: 'session.keep_alive' }), KEEP_ALIVE_MS);
  }

  /** Starts the session and resolves only when video+audio are in the room and the websocket reports `connected`. */
  static async connect(credentials: AvatarCredentials, video: HTMLVideoElement, events: AvatarEvents): Promise<LiteAvatar> {
    const session = new LiteSession(credentials.sessionToken);
    const streamReady = new Promise<void>((resolve) => session.once(SessionEvent.SESSION_STREAM_READY, resolve));
    let avatar: LiteAvatar | null = null;
    try {
      // The SDK never rejects when the websocket cannot open, so the whole start is bounded.
      await within(session.start(), CONNECT_TIMEOUT_MS, 'Avataren svarte ikke i tide.');
      const socket = session.socket;
      if (!socket) throw new Error('Avataren ga ingen kommandokanal.');
      // Registered in the same task as start() resolving, before the first websocket message is dispatched.
      avatar = new LiteAvatar(session, socket, events);
      session.on(SessionEvent.SESSION_DISCONNECTED, () => avatar?.shutdown('Avataren er koblet fra. Start den på nytt ved behov.'));
      await within(Promise.all([streamReady, avatar.ready]), CONNECT_TIMEOUT_MS, 'Avataren ble ikke klar i tide.');
      session.attach(video);
      return avatar;
    } catch (error) {
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
    const ours = this.utterance !== null && message.source_event_id === this.utterance;
    if (message.type === 'session.state_updated') {
      this.connected = message.state === 'connected';
      if (this.connected) this.markReady();
    } else if (message.type === 'agent.speak_started' && ours) {
      this.events.speaking(true);
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

  /** Sends raw PCM16 mono 24 kHz (as returned by /api/media/speak with format pcm) as one utterance. */
  speak(pcm: ArrayBuffer) {
    if (!this.connected) throw new Error('Avataren er ikke klar.');
    const bytes = new Uint8Array(pcm, 0, pcm.byteLength - (pcm.byteLength % 2));
    if (bytes.length === 0) return;
    const id = crypto.randomUUID();
    this.utterance = id;
    for (let at = 0; at < bytes.length; at += CHUNK_BYTES) {
      // The first chunk's event_id names the utterance; later chunks may use any id.
      this.send({ type: 'agent.speak', event_id: at === 0 ? id : crypto.randomUUID(), audio: toBase64(bytes.subarray(at, at + CHUNK_BYTES)) });
    }
    this.send({ type: 'agent.speak_end', event_id: crypto.randomUUID() });
  }

  /** Barge-in: clears buffered audio and seals the current utterance. */
  interrupt() {
    if (!this.connected || this.closed) return;
    this.utterance = null;
    this.send({ type: 'agent.interrupt', event_id: crypto.randomUUID() });
    this.events.speaking(false);
  }

  /** Mirrors the real recording state in the avatar pose. */
  listening(on: boolean) {
    if (!this.connected || this.closed) return;
    this.send({ type: on ? 'agent.start_listening' : 'agent.stop_listening', event_id: crypto.randomUUID() });
  }

  private shutdown(message: string) {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.heartbeat);
    this.socket.removeEventListener('message', this.onMessage);
    this.events.speaking(false);
    this.events.closed(message);
  }

  /** Ends the session. The SDK stops the provider session with the session token; the caller also releases it server-side. */
  async stop() {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.heartbeat);
    this.socket.removeEventListener('message', this.onMessage);
    await this.session.stop().catch(() => undefined);
  }
}
