/** Plays one MP3 at a time. Every exit path pauses the element and revokes its object URL. */
export class Playback {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;

  /** Rejects with the browser's error (NotAllowedError when autoplay is blocked). `onEnd` runs once playback ends on its own. */
  async play(bytes: ArrayBuffer, onEnd: () => void): Promise<void> {
    this.stop();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const audio = new Audio(url);
    this.url = url;
    this.audio = audio;
    const done = () => {
      if (this.audio !== audio) return;
      this.stop();
      onEnd();
    };
    audio.onended = done;
    audio.onerror = done;
    try {
      await audio.play();
    } catch (error) {
      if (this.audio === audio) this.stop();
      throw error;
    }
  }

  stop() {
    const audio = this.audio;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = null;
    this.url = null;
  }
}
