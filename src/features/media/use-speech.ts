'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Session } from '@/lib/contracts';
import type { LiteAvatar } from './avatar-client';
import { fetchSpeech } from './client';
import { Playback } from './playback';

export type SpeechState = 'idle' | 'loading' | 'speaking';

type Options = {
  session: Session;
  /** True only after the student explicitly turned audio (or the avatar) on. */
  enabled: boolean;
  /** True while the student records or a transcript is being made: nothing may play. */
  hold: boolean;
  avatar: RefObject<{ avatar: LiteAvatar } | null>;
  avatarSpeaking: boolean;
  /** The browser refused to play without a user gesture. */
  onBlocked: () => void;
  onError: (message: string) => void;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Opplesing feilet. Les svaret på skjermen.');

/**
 * Reads each persisted assistant turn aloud once, through ElevenLabs. The text is never sent from the browser:
 * only the turn id, so the server speaks exactly what is stored. Voice mode plays MP3; avatar mode sends PCM
 * to the avatar. Anything in flight is stopped when the student starts speaking, audio is turned off, or the
 * component goes away.
 */
export function useSpeech({ session, enabled, hold, avatar, avatarSpeaking, onBlocked, onError }: Options) {
  const [state, setState] = useState<SpeechState>('idle');
  const [replays, setReplays] = useState(0);
  const spoken = useRef(new Set<string>());
  const playback = useRef<Playback | null>(null);
  const callbacks = useRef({ onBlocked, onError });
  useEffect(() => {
    callbacks.current = { onBlocked, onError };
  });

  let latestId: string | null = null;
  for (const turn of session.turns) if (turn.role === 'assistant') latestId = turn.id;

  // A question that was current when the student started to speak is considered handled.
  useEffect(() => {
    if (hold && latestId) spoken.current.add(latestId);
  }, [hold, latestId]);

  useEffect(() => {
    if (!enabled || hold || !latestId || spoken.current.has(latestId)) return undefined;
    const turnId = latestId;
    const controller = new AbortController();
    const player = playback.current ?? new Playback();
    playback.current = player;
    const activeAvatar = avatar.current?.avatar;

    (async () => {
      setState('loading');
      try {
        if (session.mode === 'avatar') {
          const pcm = await fetchSpeech(session.id, turnId, 'pcm', controller.signal);
          const live = activeAvatar;
          if (controller.signal.aborted) return;
          if (!live) throw new Error('Avataren er ikke tilkoblet. Les svaret på skjermen.');
          live.speak(pcm);
          spoken.current.add(turnId);
          setState('idle');
        } else {
          const mp3 = await fetchSpeech(session.id, turnId, 'mp3', controller.signal);
          if (controller.signal.aborted) return;
          await player.play(mp3, () => setState('idle'));
          spoken.current.add(turnId);
          setState('speaking');
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState('idle');
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          callbacks.current.onBlocked();
          return;
        }
        spoken.current.add(turnId);
        callbacks.current.onError(messageOf(error));
      }
    })();

    return () => {
      controller.abort();
      player.stop();
      try {
        activeAvatar?.interrupt();
      } catch {
        // The avatar socket is already gone; nothing left to interrupt.
      }
      setState('idle');
    };
  }, [enabled, hold, latestId, replays, session.id, session.mode, avatar]);

  useEffect(() => () => playback.current?.stop(), []);

  /** Speak the newest assistant turn again. */
  const replay = useCallback(() => {
    if (latestId) spoken.current.delete(latestId);
    setReplays((count) => count + 1);
  }, [latestId]);

  /** Stop playback now (barge-in). The current turn counts as handled. */
  const interrupt = useCallback(() => {
    if (latestId) spoken.current.add(latestId);
    playback.current?.stop();
    try {
      avatar.current?.avatar.interrupt();
    } catch {
      // See above.
    }
    setState('idle');
  }, [latestId, avatar]);

  return { state: avatarSpeaking ? ('speaking' as const) : state, replay, interrupt };
}
