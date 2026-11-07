'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LiteAvatar } from './avatar-client';
import { releaseAvatar, requestAvatar } from './client';
import type { AvatarCredentials } from './types';

export type AvatarPhase = 'off' | 'starting' | 'ready';

type Options = {
  sessionId: string;
  /** Changes whenever the avatar must end (session, mode or status changed). */
  scope: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  onError: (message: string) => void;
};

type PendingAvatar = { controller: AbortController; credentials: AvatarCredentials | null };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Avataren kunne ikke startes. Bruk tekst i stedet.');

/**
 * Owns one LiveAvatar Lite session. It starts only from start() (an explicit press, because it costs
 * credits), and is ended on stop(), unmount, session change and page hide. A failed start never leaves a
 * provider session behind and never shows a placeholder avatar.
 */
export function useAvatar({ sessionId, scope, videoRef, onError }: Options) {
  const [phase, setPhase] = useState<AvatarPhase>('off');
  const [speaking, setSpeaking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const live = useRef<{ avatar: LiteAvatar; credentials: AvatarCredentials } | null>(null);
  const pending = useRef<PendingAvatar | null>(null);
  const generation = useRef(0);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const stop = useCallback(async () => {
    generation.current += 1;
    const attempt = pending.current;
    pending.current = null;
    const pendingCredentials = attempt?.credentials;
    if (attempt) {
      attempt.credentials = null;
      attempt.controller.abort();
    }
    const current = live.current;
    live.current = null;
    setPhase('off');
    setSpeaking(false);
    setAudioBlocked(false);
    await Promise.allSettled([
      ...(current ? [current.avatar.stop(), releaseAvatar(sessionId, current.credentials)] : []),
      ...(pendingCredentials ? [releaseAvatar(sessionId, pendingCredentials)] : []),
    ]);
  }, [sessionId]);

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
    const attempt: PendingAvatar = { controller: new AbortController(), credentials: null };
    pending.current = attempt;
    setPhase('starting');
    let avatar: LiteAvatar | null = null;
    try {
      const credentials = await requestAvatar(sessionId);
      attempt.credentials = credentials;
      const video = videoRef.current;
      if (generation.current !== mine) throw new Error('cancelled');
      if (!video) throw new Error('Avatarvisningen er ikke klar. Prøv igjen.');
      // Dynamic on purpose: the SDK bundles livekit-client (browser-only, large); load it only when an avatar is started.
      const { LiteAvatar: Lite } = await import('./avatar-client');
      attempt.controller.signal.throwIfAborted();
      avatar = await Lite.connect(credentials, video, {
        speaking: (value) => {
          if (generation.current === mine) setSpeaking(value);
        },
        closed: (message) => {
          if (generation.current !== mine) return;
          void stop();
          onErrorRef.current(message);
        },
        failure: (message) => {
          if (generation.current === mine) onErrorRef.current(message);
        },
      }, attempt.controller.signal);
      if (generation.current !== mine) throw new Error('cancelled');
      live.current = { avatar, credentials };
      attempt.credentials = null;
      setPhase('ready');
      await video.play().catch(() => {
        if (generation.current === mine) setAudioBlocked(true);
      });
      return generation.current === mine;
    } catch (error) {
      const pendingCredentials = attempt.credentials;
      attempt.credentials = null;
      await Promise.allSettled([
        ...(avatar ? [avatar.stop()] : []),
        ...(pendingCredentials ? [releaseAvatar(sessionId, pendingCredentials)] : []),
      ]);
      if (generation.current === mine) {
        setPhase('off');
        onErrorRef.current(messageOf(error));
      }
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
    return false;
  }, [phase, sessionId, stop, videoRef]);

  const enableAudio = useCallback(() => {
    void videoRef.current?.play().then(() => setAudioBlocked(false), () => undefined);
  }, [videoRef]);

  return { phase, speaking, audioBlocked, enableAudio, start, stop, avatar: live };
}
