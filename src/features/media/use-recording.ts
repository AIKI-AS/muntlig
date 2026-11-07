'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeRecording } from './client';
import { Recorder, type Recording } from './recorder';

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'transcribing';

type Options = {
  sessionId: string;
  /** Part of the teardown key: switching mode ends any recording. */
  mode: string;
  /** Tear everything down when this turns false (session ended, mode changed). */
  active: boolean;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Noe gikk galt. Skriv svaret i stedet.');

/**
 * Press-to-record. The microphone is requested only from start(), never on mount, and every track is
 * stopped on finish, cancel, unmount or when `active` turns false.
 */
export function useRecording({ sessionId, mode, active, onTranscript, onError }: Options) {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<Recorder | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  // Latest callbacks without re-running the teardown effect.
  const callbacks = useRef({ onTranscript, onError });
  useEffect(() => {
    callbacks.current = { onTranscript, onError };
  });

  const teardown = useCallback(() => {
    generation.current += 1;
    recorder.current?.cancel();
    recorder.current = null;
    abort.current?.abort();
    abort.current = null;
    setPhase('idle');
    setSeconds(0);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    return teardown;
  }, [active, sessionId, mode, teardown]);

  const start = useCallback(async () => {
    if (phase !== 'idle') return;
    const mine = ++generation.current;
    setPhase('starting');
    setSeconds(0);

    const onFinish = async (recording: Recording) => {
      if (generation.current !== mine) return;
      recorder.current = null;
      setPhase('transcribing');
      const controller = new AbortController();
      abort.current = controller;
      try {
        const text = await transcribeRecording(sessionId, recording.blob, controller.signal);
        if (generation.current === mine) callbacks.current.onTranscript(text);
      } catch (error) {
        if (generation.current === mine && !controller.signal.aborted) callbacks.current.onError(messageOf(error));
      } finally {
        if (generation.current === mine) {
          abort.current = null;
          setPhase('idle');
        }
      }
    };
    const onFailure = (message: string) => {
      if (generation.current !== mine) return;
      recorder.current = null;
      setPhase('idle');
      callbacks.current.onError(message);
    };

    try {
      const created = await Recorder.start((elapsed) => {
        if (generation.current === mine) setSeconds(elapsed);
      }, (recording) => void onFinish(recording), onFailure);
      if (generation.current !== mine) {
        created.cancel();
        return;
      }
      recorder.current = created;
      setPhase('recording');
    } catch (error) {
      if (generation.current !== mine) return;
      setPhase('idle');
      callbacks.current.onError(messageOf(error));
    }
  }, [sessionId, phase]);

  return {
    phase,
    seconds,
    start,
    /** Stop recording and transcribe what was said. */
    finish: useCallback(() => recorder.current?.finish(), []),
    /** Stop and discard. Also aborts a running transcription. */
    cancel: teardown,
  };
}
