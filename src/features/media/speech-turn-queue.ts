import type { Turn } from '@/lib/contracts';

/** Response-level captions; provider utterances need not match response boundaries. */
export class SpeechTurnQueue {
  private pending = new Map<string, Turn>();
  private lastSpeech: string | null = null;
  private awaitingText = false;

  receive(turn: Turn): Turn[] {
    if (this.awaitingText) {
      this.awaitingText = false;
      return [turn];
    }
    this.pending.set(turn.id, turn);
    return [];
  }

  speechStarted(utteranceId: string): Turn[] {
    if (this.lastSpeech === utteranceId) return [];
    this.lastSpeech = utteranceId;
    const hadPending = this.pending.size > 0;
    const turns = this.flush();
    this.awaitingText = !hadPending;
    return turns;
  }

  flush(): Turn[] {
    const turns = [...this.pending.values()];
    this.pending.clear();
    this.awaitingText = false;
    return turns;
  }

  correct(id: string, text: string): void {
    const turn = this.pending.get(id);
    if (turn) this.pending.set(id, { ...turn, text });
  }
}
