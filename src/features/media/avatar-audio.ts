const CHUNK_BYTES = 48_000; // One second of PCM16 mono, 24 kHz; LiveAvatar's recommended packet size.

function base64(bytes: Uint8Array) {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x4000));
  }
  return btoa(binary);
}

/** Preserves every PCM sample, including silence; bounds pending audio to one provider packet. */
export class AvatarAudioStream {
  utteranceId: string | null = null;
  private open = false;
  private readonly buffer = new Uint8Array(CHUNK_BYTES);
  private pending = 0;

  constructor(private readonly send: (command: Record<string, string>) => void) {}

  append(audio: string) {
    const binary = atob(audio);
    if (binary.length % 2) throw new Error('Avataren trenger hele PCM16-lydprøver.');
    if (!binary.length) return;
    if (!this.open) {
      this.utteranceId = crypto.randomUUID();
      this.open = true;
    }
    for (let at = 0; at < binary.length; at++) {
      this.buffer[this.pending++] = binary.charCodeAt(at);
      if (this.pending === CHUNK_BYTES) this.flush();
    }
  }

  private flush() {
    if (!this.pending || !this.utteranceId) return;
    this.send({ type: 'agent.speak', event_id: this.utteranceId, audio: base64(this.buffer.subarray(0, this.pending)) });
    this.pending = 0;
  }

  commit() {
    if (!this.open) return;
    this.flush();
    this.send({ type: 'agent.speak_end', event_id: crypto.randomUUID() });
    this.open = false;
  }

  interrupt() {
    this.pending = 0;
    this.open = false;
    this.utteranceId = null;
    this.send({ type: 'agent.interrupt', event_id: crypto.randomUUID() });
  }
}
