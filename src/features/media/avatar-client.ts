import { LogLevel, SimliClient } from 'simli-client';
import { AvatarAudioStream } from './avatar-audio';
import type { AvatarCredentials } from './types';

/**
 * Simli Trinity-2 avatar in the browser (simli-client 3.2.0, LiveKit transport). ElevenLabs keeps the microphone and
 * the conversation; this class only receives its PCM and plays the lip-synced video and the voice Simli returns,
 * on separate video (muted) and audio elements. It never captures or publishes a microphone.
 *
 * SDK facts this code relies on, from its source:
 * - The constructor already opens the websocket and an AudioContext, so hooks are registered before start().
 * - start() resolves at the first video frame, retries network failures up to 10 times with backoff (minutes),
 *   and only stop() cancels it. A stop() during a retry delay is not enough: the retry then opens a new
 *   transport, so the transport is stopped again once start() settles.
 * - stop() leaves its AudioContext open and no event reports a dropped websocket; both are handled here.
 * - Errors are thrown as raw provider strings. They are never shown or logged; the SDK logger is silenced.
 */

const START_TIMEOUT_MS = 30_000;
const VOICE_POLL_MS = 50;
const START_FAILED = 'Avataren kunne ikke startes. Bruk tekst i stedet.';
const START_TIMED_OUT = 'Avataren svarte ikke i tide. Bruk tekst i stedet.';
const NOT_CONNECTED = 'Avataren er ikke tilkoblet.';
const SESSION_ENDED = 'Avataren er koblet fra. Avslutt økten for å hente gjennomgangen.';
const SESSION_FAILED = 'Avataren rapporterte en feil. Avslutt økten for å hente gjennomgangen.';
const CONNECTION_LOST = 'Avataren mistet forbindelsen. Avslutt økten for å hente gjennomgangen.';
const TIMEOUT = Symbol('timeout');

/** Private in simli-client 3.2.0's types; the paths are optional so a changed SDK degrades to the send-failure path. */
type SimliInternals = { audioContext?: AudioContext; connection?: { signalingConnection?: { wsConnection?: WebSocket } } };

/** Settles like `work`, or rejects when `signal` aborts or `ms` pass first. Never leaves the work unhandled. */
function until<T>(work: Promise<T>, signal: AbortSignal, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
    };
    const aborted = () => { done(); reject(signal.reason); };
    const timer = window.setTimeout(() => { done(); reject(TIMEOUT); }, ms);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    work.then(
      (value) => { done(); resolve(value); },
      (error: unknown) => { done(); reject(error); },
    );
  });
}

function release(element: HTMLMediaElement) {
  const stream = element.srcObject;
  element.pause();
  element.srcObject = null;
  if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
}

export class SimliAvatar {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onDisconnect?: (message?: string) => void;

  private ready = false;
  private closed = false;
  private speaking = false;
  private stopping: Promise<void> | null = null;
  private readonly lifetime = new AbortController();
  private readonly stream: AvatarAudioStream;

  private constructor(
    private readonly client: SimliClient,
    private readonly video: HTMLVideoElement,
    private readonly speaker: HTMLAudioElement,
  ) {
    this.stream = new AvatarAudioStream({
      send: (pcm) => this.transport(() => client.sendAudioData(pcm)),
      clear: () => this.transport(() => client.ClearBuffer()),
    });
    client.on('speaking', () => this.setSpeaking(true));
    client.on('silent', () => this.setSpeaking(false));
    client.on('stop', () => this.disconnect(SESSION_ENDED));
    client.on('error', () => this.disconnect(SESSION_FAILED));
  }

  /**
   * Resolves at the first video frame with the returned voice attached, within 30 s. Rejects with a sanitized
   * Norwegian message (or the signal's reason when aborted); every failure path leaves nothing running.
   */
  static async start(credentials: AvatarCredentials, video: HTMLVideoElement, speaker: HTMLAudioElement, signal?: AbortSignal): Promise<SimliAvatar> {
    signal?.throwIfAborted();
    video.muted = true; // Only the voice Simli returns on `speaker` is audible.
    let client: SimliClient;
    try {
      client = new SimliClient(credentials.sessionToken, video, speaker, null, LogLevel.CRITICAL);
    } catch {
      throw new Error(START_FAILED);
    }
    const avatar = new SimliAvatar(client, video, speaker);
    const cancel = () => { void avatar.teardown(signal?.reason); };
    signal?.addEventListener('abort', cancel, { once: true });
    const started = avatar.connect();
    // A retry that was already scheduled when we gave up still opens a transport; stop that one too.
    const settled = () => {
      if (!avatar.closed) return;
      void client.stop().catch(() => undefined).finally(() => {
        release(video);
        release(speaker);
      });
    };
    started.then(settled, settled);
    try {
      await until(started, avatar.lifetime.signal, START_TIMEOUT_MS);
      if (avatar.closed) throw avatar.lifetime.signal.reason;
      avatar.watchSocket();
      avatar.ready = true;
      return avatar;
    } catch (error) {
      await avatar.teardown();
      if (signal?.aborted) throw signal.reason;
      throw new Error(error === TIMEOUT ? START_TIMED_OUT : START_FAILED);
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }

  /** Takes base64 PCM16 mono 24 kHz from the ElevenLabs audio callback. Throws when the avatar cannot play it. */
  audio(base64: string) {
    if (!this.ready || this.closed) throw new Error(NOT_CONNECTED);
    this.stream.append(base64);
  }

  /** The agent finished this turn: flushes the last samples behind the audio already queued. */
  endAudio() {
    if (!this.ready || this.closed) return;
    this.stream.end();
  }

  /** Barge-in: drops everything Simli has queued and ends the speaking state at once. */
  interrupt() {
    if (!this.ready || this.closed) return;
    this.stream.interrupt();
    this.setSpeaking(false);
  }

  /** Idempotent, never rejects. Stops the transport and releases tracks, element sources and the AudioContext. */
  stop() {
    return this.teardown();
  }

  private async connect() {
    await this.client.start();
    // The voice and the video arrive as separate tracks; without the voice the learner would hear nothing.
    while (!this.closed && !this.hasVoice()) await new Promise((resolve) => window.setTimeout(resolve, VOICE_POLL_MS));
  }

  private hasVoice() {
    const stream = this.speaker.srcObject;
    return stream instanceof MediaStream && stream.getAudioTracks().some((track) => track.readyState === 'live');
  }

  private watchSocket() {
    const socket = (this.client as unknown as SimliInternals).connection?.signalingConnection?.wsConnection;
    if (!socket) return;
    if (socket.readyState !== WebSocket.OPEN) throw new Error(START_FAILED);
    socket.addEventListener('close', this.onSocketClose);
  }

  private readonly onSocketClose = () => this.disconnect(CONNECTION_LOST);

  /** Simli throws a raw string when the websocket is not open. */
  private transport(send: () => void) {
    try {
      send();
    } catch {
      this.disconnect(CONNECTION_LOST);
      throw new Error(NOT_CONNECTED);
    }
  }

  /** Reports the real playback state, once per transition. */
  private setSpeaking(speaking: boolean) {
    if (!this.ready || this.closed || this.speaking === speaking) return;
    this.speaking = speaking;
    if (speaking) this.onSpeechStart?.();
    else this.onSpeechEnd?.();
  }

  private disconnect(message: string) {
    if (this.closed) return;
    const notify = this.onDisconnect;
    void this.teardown();
    notify?.(message);
  }

  private teardown(reason: unknown = new Error(START_FAILED)): Promise<void> {
    if (this.stopping) return this.stopping;
    this.closed = true;
    this.onSpeechStart = this.onSpeechEnd = this.onDisconnect = undefined;
    this.lifetime.abort(reason);
    this.stopping = this.client.stop().catch(() => undefined);
    release(this.video);
    release(this.speaker);
    void (this.client as unknown as SimliInternals).audioContext?.close().catch(() => undefined);
    return this.stopping;
  }
}
