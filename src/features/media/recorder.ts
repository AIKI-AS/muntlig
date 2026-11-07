import { MAX_RECORDING_SECONDS } from './types';

export type Recording = { blob: Blob; seconds: number };

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const MIN_SECONDS = 0.5;

/** Records the microphone into memory. Created only from an explicit press; releases the device on every exit path. */
export class Recorder {
  private chunks: Blob[] = [];
  private readonly startedAt = performance.now();
  private readonly timer: number;
  private discarded = false;
  private stopping = false;

  private constructor(
    private readonly stream: MediaStream,
    private readonly recorder: MediaRecorder,
    private readonly onTick: (seconds: number) => void,
    private readonly onFinish: (recording: Recording) => void,
    private readonly onFailure: (message: string) => void,
  ) {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => this.close();
    recorder.onerror = () => {
      this.discarded = true;
      this.finish();
      this.onFailure('Opptaket stoppet uventet. Prøv igjen eller skriv svaret.');
    };
    stream.getAudioTracks()[0]?.addEventListener('ended', () => this.finish());
    recorder.start(1000);
    this.timer = window.setInterval(() => {
      const seconds = (performance.now() - this.startedAt) / 1000;
      this.onTick(Math.floor(seconds));
      if (seconds >= MAX_RECORDING_SECONDS) this.finish();
    }, 250);
  }

  /** Asks for the microphone. Rejects with a Norwegian, user-safe message. */
  static async start(
    onTick: (seconds: number) => void,
    onFinish: (recording: Recording) => void,
    onFailure: (message: string) => void,
  ): Promise<Recorder> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Nettleseren kan ikke ta opp lyd. Skriv svaret i stedet.');
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('Fant ingen mikrofon. Skriv svaret i stedet.');
      if (name === 'NotReadableError') throw new Error('Mikrofonen er i bruk i et annet program. Skriv svaret i stedet.');
      throw new Error('Mikrofontilgang ble avslått. Du kan tillate den i nettleseren, eller skrive svaret i stedet.');
    }
    try {
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
      return new Recorder(stream, recorder, onTick, onFinish, onFailure);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Nettleseren kan ikke ta opp lyd. Skriv svaret i stedet.');
    }
  }

  /** Stop and deliver the recording. Safe to call more than once. */
  finish() {
    if (this.stopping) return;
    this.stopping = true;
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    else this.close();
  }

  /** Stop and throw the recording away. */
  cancel() {
    this.discarded = true;
    this.finish();
  }

  private close() {
    window.clearInterval(this.timer);
    this.stream.getTracks().forEach((track) => track.stop());
    this.recorder.ondataavailable = null;
    this.recorder.onstop = null;
    this.recorder.onerror = null;
    const chunks = this.chunks;
    this.chunks = [];
    if (this.discarded || chunks.length === 0) return;
    const seconds = (performance.now() - this.startedAt) / 1000;
    if (seconds < MIN_SECONDS) {
      this.onFailure('Opptaket var for kort. Hold inne litt lenger og prøv igjen.');
      return;
    }
    this.onFinish({ blob: new Blob(chunks, { type: this.recorder.mimeType || 'audio/webm' }), seconds });
  }
}
