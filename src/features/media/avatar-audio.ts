/**
 * ElevenLabs delivers PCM16 mono at 24 kHz; Simli consumes PCM16 mono at 16 kHz. The conversion is streamed:
 * speech is forwarded as soon as it is converted (never held for a full packet), the conversion state survives
 * chunk boundaries, and a turn ends with endAudio(), which flushes the last samples through the queued path.
 */

const PACKET_BYTES = 6_000; // Simli's recommended chunk: 3000 samples, 187.5 ms at 16 kHz.
const HALF_SPAN = 24; // Source samples on each side of an output sample.
const CUTOFF = 0.3; // 7.2 kHz in cycles per 24 kHz sample, below the 8 kHz Nyquist limit of the output.

/** Output sample j sits at source position 1.5 j, so it is either on a source sample or half-way between two. */
const KERNELS = [0, 0.5].map((offset) => {
  const taps = Array.from({ length: 2 * HALF_SPAN }, (_, at) => {
    const t = at - HALF_SPAN + 1 - offset;
    const x = 2 * Math.PI * CUTOFF * t;
    return (x === 0 ? 1 : Math.sin(x) / x) * (0.5 + 0.5 * Math.cos((Math.PI * t) / HALF_SPAN));
  });
  const gain = taps.reduce((sum, tap) => sum + tap, 0);
  return taps.map((tap) => tap / gain);
});

class Downsampler {
  private source = new Int16Array(0);
  private first = 0; // Absolute index of source[0].
  private produced = 0;

  /** Converts every sample whose neighbours have arrived; the rest waits for the next chunk. */
  push(samples: Int16Array) {
    const joined = new Int16Array(this.source.length + samples.length);
    joined.set(this.source);
    joined.set(samples, this.source.length);
    this.source = joined;
    return this.convert(false);
  }

  /** Converts what is still waiting, treating the speech as followed by silence, and starts over. */
  finish() {
    const tail = this.convert(true);
    this.reset();
    return tail;
  }

  reset() {
    this.source = new Int16Array(0);
    this.first = 0;
    this.produced = 0;
  }

  private convert(final: boolean) {
    const total = this.first + this.source.length;
    const out: number[] = [];
    for (;;) {
      const twice = 3 * this.produced;
      const centre = Math.floor(twice / 2);
      if (final ? twice >= 2 * total : centre + HALF_SPAN >= total) break;
      const taps = KERNELS[twice % 2];
      let sum = 0;
      for (let at = 0; at < taps.length; at++) {
        const index = centre + at - HALF_SPAN + 1 - this.first;
        if (index >= 0 && index < this.source.length) sum += this.source[index] * taps[at];
      }
      out.push(Math.max(-32_768, Math.min(32_767, Math.round(sum))));
      this.produced++;
    }
    const keep = Math.max(this.first, Math.floor((3 * this.produced) / 2) - HALF_SPAN + 1);
    this.source = this.source.slice(keep - this.first);
    this.first = keep;
    return Int16Array.from(out);
  }
}

export type AvatarAudioSink = {
  /** Queued behind audio already sent; takes PCM16 mono 16 kHz. */
  send: (pcm: Uint8Array) => void;
  /** Drops everything the provider has queued but not yet spoken. */
  clear: () => void;
};

export class AvatarAudioStream {
  private readonly converter = new Downsampler();

  constructor(private readonly sink: AvatarAudioSink) {}

  /** Takes base64 PCM16 mono 24 kHz; the chunks may be split anywhere on a sample boundary. */
  append(base64: string) {
    const binary = atob(base64);
    if (binary.length % 2) throw new Error('Avataren trenger hele PCM16-lydprøver.');
    if (!binary.length) return;
    const samples = new Int16Array(binary.length / 2);
    for (let at = 0; at < samples.length; at++) {
      samples[at] = binary.charCodeAt(2 * at) | (binary.charCodeAt(2 * at + 1) << 8);
    }
    this.forward(this.converter.push(samples));
  }

  /** The turn is over: flushes the last converted samples and prepares for the next turn. */
  end() {
    this.forward(this.converter.finish());
  }

  /** Barge-in: unsent speech of the old turn is discarded and the provider's queue is cleared. */
  interrupt() {
    this.converter.reset();
    this.sink.clear();
  }

  private forward(samples: Int16Array) {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    samples.forEach((sample, at) => view.setInt16(at * 2, sample, true));
    for (let at = 0; at < bytes.length; at += PACKET_BYTES) this.sink.send(bytes.subarray(at, at + PACKET_BYTES));
  }
}
