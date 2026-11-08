'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { SimliAvatar } from './avatar-client';
import { requestAvatar } from './client';

export type AvatarPhase = 'off' | 'starting' | 'ready';

type Options = {
  sessionId: string;
  /** Changes whenever the avatar must end (session, mode or status changed). */
  scope: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Receives the voice Simli returns; the only audible output in avatar mode. */
  audioRef: RefObject<HTMLAudioElement | null>;
  onError: (message: string) => void;
  /** The avatar really started speaking (after silence). */
  onSpeechStart: () => void;
  /** The avatar really stopped speaking (never fires for the initial silence). */
  onSpeechEnd: () => void;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Avataren kunne ikke startes. Bruk tekst i stedet.');

/**
 * Owns one Simli avatar session. It starts only from start() (an explicit press, because it costs
 * minutes), and is ended on stop(), unmount, session change and page hide. A failed start never leaves a
 * provider session behind, never shows a placeholder avatar and never falls back to voice only.
 */
export function useAvatar({ sessionId, scope, videoRef, audioRef, onError, onSpeechStart, onSpeechEnd }: Options) {
  const [phase, setPhase] = useState<AvatarPhase>('off');
  const [speaking, setSpeaking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const live = useRef<{ avatar: SimliAvatar } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const onErrorRef = useRef(onError);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  useEffect(() => {
    onErrorRef.current = onError;
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
  });

  const stop = useCallback(async () => {
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
    const current = live.current;
    live.current = null;
    setPhase('off');
    setSpeaking(false);
    setAudioBlocked(false);
    await current?.avatar.stop();
  }, []);

  useEffect(() => {
    const onHide = () => { void stop(); };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void stop();
    };
  }, [sessionId, scope, stop]);

  const start = useCallback(async () => {
    if (pending.current || live.current || phase !== 'off') return false;
    const mine = ++generation.current;
    const attempt = new AbortController();
    pending.current = attempt;
    setPhase('starting');
    let avatar: SimliAvatar | null = null;
    try {
      const video = videoRef.current;
      const speaker = audioRef.current;
      if (!video || !speaker) throw new Error('Avatarvisningen er ikke klar. Prøv igjen.');
      // Importing only downloads code; overlap it with credentials instead of waiting for another round trip.
      const [credentials, { SimliAvatar: Simli }] = await Promise.all([
        requestAvatar(sessionId),
        import('./avatar-client'),
      ]);
      attempt.signal.throwIfAborted();
      avatar = await Simli.start(credentials, video, speaker, attempt.signal);
      if (generation.current !== mine) throw new Error('cancelled');
      avatar.onSpeechStart = () => {
        if (generation.current !== mine) return;
        setSpeaking(true);
        onSpeechStartRef.current();
      };
      avatar.onSpeechEnd = () => {
        if (generation.current !== mine) return;
        setSpeaking(false);
        onSpeechEndRef.current();
      };
      avatar.onDisconnect = (message) => {
        if (generation.current !== mine) return;
        void stop();
        onErrorRef.current(message ?? 'Avataren mistet forbindelsen. Avslutt økten for å hente gjennomgangen.');
      };
      live.current = { avatar };
      setPhase('ready');
      // Autoplay can be refused even after a click; the learner then enables sound with one press.
      const blocked = await Promise.all([video.play(), speaker.play()]).then(() => false, () => true);
      if (generation.current === mine && blocked) setAudioBlocked(true);
      return generation.current === mine;
    } catch (error) {
      await avatar?.stop();
      if (generation.current === mine) {
        setPhase('off');
        onErrorRef.current(messageOf(error));
      }
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
    return false;
  }, [phase, sessionId, stop, videoRef, audioRef]);

  const enableAudio = useCallback(() => {
    void Promise.all([videoRef.current?.play(), audioRef.current?.play()]).then(() => setAudioBlocked(false), () => undefined);
  }, [videoRef, audioRef]);

  return { phase, speaking, audioBlocked, enableAudio, start, stop, avatar: live };
}
