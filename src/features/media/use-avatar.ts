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
  const generation = useRef(0);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const stop = useCallback(() => {
    generation.current += 1;
    const current = live.current;
    live.current = null;
    setPhase('off');
    setSpeaking(false);
    setAudioBlocked(false);
    if (!current) return;
    void current.avatar.stop();
    void releaseAvatar(sessionId, current.credentials);
  }, [sessionId]);

  useEffect(() => {
    const onHide = () => {
      if (live.current) void releaseAvatar(sessionId, live.current.credentials);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      stop();
    };
  }, [sessionId, scope, stop]);

  const start = useCallback(async () => {
    if (phase !== 'off') return;
    const mine = ++generation.current;
    setPhase('starting');
    let credentials: AvatarCredentials | null = null;
    let avatar: LiteAvatar | null = null;
    try {
      credentials = await requestAvatar(sessionId);
      const video = videoRef.current;
      if (generation.current !== mine) throw new Error('cancelled');
      if (!video) throw new Error('Avatarvisningen er ikke klar. Prøv igjen.');
      // Dynamic on purpose: the SDK bundles livekit-client (browser-only, large); load it only when an avatar is started.
      const { LiteAvatar: Lite } = await import('./avatar-client');
      avatar = await Lite.connect(credentials, video, {
        speaking: (value) => {
          if (generation.current === mine) setSpeaking(value);
        },
        closed: (message) => {
          if (generation.current !== mine) return;
          stop();
          onErrorRef.current(message);
        },
        failure: (message) => {
          if (generation.current === mine) onErrorRef.current(message);
        },
      });
      if (generation.current !== mine) throw new Error('cancelled');
      live.current = { avatar, credentials };
      setPhase('ready');
      video.play().catch(() => setAudioBlocked(true));
    } catch (error) {
      if (avatar) void avatar.stop();
      if (credentials) void releaseAvatar(sessionId, credentials);
      if (generation.current === mine) {
        setPhase('off');
        onErrorRef.current(messageOf(error));
      }
    }
  }, [phase, sessionId, stop, videoRef]);

  const enableAudio = useCallback(() => {
    void videoRef.current?.play().then(() => setAudioBlocked(false), () => undefined);
  }, [videoRef]);

  return { phase, speaking, audioBlocked, enableAudio, start, stop, avatar: live };
}
