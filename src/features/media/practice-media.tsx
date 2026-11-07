'use client';

import { useCallback, useRef, useState } from 'react';
import { Mic, Play, Square, Video, VideoOff, Volume2, VolumeX, X } from 'lucide-react';
import type { Session } from '@/lib/contracts';
import './practice-media.css';
import { MAX_RECORDING_SECONDS } from './types';
import { useAvatar } from './use-avatar';
import { useRecording } from './use-recording';
import { useSpeech } from './use-speech';

export type PracticeMediaProps = {
  session: Session;
  /** Receives the real transcript of the student's recording; the parent lets the student edit it before sending. */
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  /** The parent is sending a turn or waiting for the assistant. */
  busy: boolean;
};

const clock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/**
 * Voice and avatar controls for one practice session. `session.mode === 'text'` renders nothing, so the
 * parent keeps its text input as the always-available fallback. The microphone, audio playback and the
 * avatar all start from an explicit button press only.
 */
export function PracticeMedia({ session, onTranscript, onError, busy }: PracticeMediaProps) {
  const mode = session.mode;
  const active = mode !== 'text' && session.status === 'active';
  const scope = `${session.id}:${mode}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Scoped to session and mode, so switching either turns audio off again without an effect.
  const [audioScope, setAudioScope] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null);
  const say = (text: string) => setNotice({ scope, text });
  const visibleNotice = notice?.scope === scope ? notice.text : null;

  const avatar = useAvatar({ sessionId: session.id, scope: `${scope}:${active}`, videoRef, onError });
  const audioOn = mode === 'avatar' ? avatar.phase === 'ready' : audioScope === scope;

  const handleTranscript = useCallback((text: string) => {
    setNotice({ scope, text: 'Opptaket er skrevet ut i svarfeltet. Les gjennom og rett det du vil før du sender.' });
    onTranscript(text);
  }, [onTranscript, scope]);
  const recording = useRecording({ sessionId: session.id, mode, active, onTranscript: handleTranscript, onError });
  const recordingActive = recording.phase !== 'idle';

  const speech = useSpeech({
    session,
    enabled: active && audioOn,
    hold: recordingActive,
    avatar: avatar.avatar,
    avatarSpeaking: avatar.speaking,
    onBlocked: () => {
      setAudioScope(null);
      say('Nettleseren blokkerte lyden. Trykk «Aktiver lyd» for å høre spørsmålet.');
    },
    onError,
  });

  if (!active) return null;

  const status = (() => {
    if (recording.phase === 'starting') return 'Venter på tilgang til mikrofonen …';
    if (recording.phase === 'recording') return 'Tar opp nå. Mikrofonen er på.';
    if (recording.phase === 'transcribing') return 'Gjør opptaket om til tekst …';
    if (speech.state === 'loading') return 'Henter opplesing …';
    if (speech.state === 'speaking') return mode === 'avatar' ? 'Avataren snakker.' : 'Leser opp spørsmålet.';
    if (mode === 'avatar' && avatar.phase === 'starting') return 'Starter avataren …';
    if (visibleNotice) return visibleNotice;
    if (mode === 'avatar') return avatar.phase === 'ready' ? 'Avataren er klar.' : 'Avataren er av. Start den når du vil snakke med den.';
    return audioOn ? 'Lyd er på. Spørsmålene leses opp.' : 'Lyd er av. Trykk «Aktiver lyd» for å høre spørsmålene.';
  })();

  return (
    <section className="media" aria-label={mode === 'avatar' ? 'Avatar og stemme' : 'Stemme'}>
      {mode === 'avatar' && (
        <div className="media-stage" hidden={avatar.phase !== 'ready'}>
          <video ref={videoRef} autoPlay playsInline aria-label="Avatar" />
        </div>
      )}

      <p className="media-status" role="status" aria-live="polite">{status}</p>

      {recording.phase === 'recording' && (
        <div className="media-timer">
          <progress max={MAX_RECORDING_SECONDS} value={recording.seconds} aria-label="Opptakstid" />
          <span className="media-hint">{clock(recording.seconds)} av {clock(MAX_RECORDING_SECONDS)}. Opptaket stopper av seg selv ved makstid.</span>
        </div>
      )}

      <div className="media-actions">
        {recording.phase === 'recording' ? (
          <>
            <button type="button" className="media-button" data-primary="true" onClick={recording.finish}>
              <Square size={18} aria-hidden="true" /> Stopp og skriv ut
            </button>
            <button type="button" className="media-button" onClick={recording.cancel}>
              <X size={18} aria-hidden="true" /> Avbryt opptak
            </button>
          </>
        ) : (
          <button
            type="button"
            className="media-button"
            data-primary="true"
            onClick={() => void recording.start()}
            disabled={busy || recording.phase !== 'idle' || (mode === 'avatar' && avatar.phase === 'starting')}
          >
            <Mic size={18} aria-hidden="true" /> {recording.phase === 'transcribing' ? 'Skriver ut …' : 'Ta opp svar'}
          </button>
        )}
        {recording.phase === 'transcribing' && (
          <button type="button" className="media-button" onClick={recording.cancel}>
            <X size={18} aria-hidden="true" /> Avbryt
          </button>
        )}

        {mode === 'voice' && (audioOn ? (
          <button type="button" className="media-button" onClick={() => { speech.interrupt(); setAudioScope(null); }}>
            <VolumeX size={18} aria-hidden="true" /> Slå av lyd
          </button>
        ) : (
          <button type="button" className="media-button" onClick={() => setAudioScope(scope)}>
            <Volume2 size={18} aria-hidden="true" /> Aktiver lyd
          </button>
        ))}

        {mode === 'avatar' && avatar.phase === 'off' && (
          <button type="button" className="media-button" onClick={() => void avatar.start()}>
            <Video size={18} aria-hidden="true" /> Start avatar
          </button>
        )}
        {mode === 'avatar' && avatar.phase === 'ready' && (
          <button type="button" className="media-button" onClick={avatar.stop}>
            <VideoOff size={18} aria-hidden="true" /> Avslutt avatar
          </button>
        )}
        {mode === 'avatar' && avatar.audioBlocked && (
          <button type="button" className="media-button" data-primary="true" onClick={avatar.enableAudio}>
            <Volume2 size={18} aria-hidden="true" /> Aktiver lyd
          </button>
        )}

        {audioOn && speech.state === 'speaking' && (
          <button type="button" className="media-button" onClick={speech.interrupt}>
            <Square size={18} aria-hidden="true" /> Stopp opplesing
          </button>
        )}
        {audioOn && speech.state === 'idle' && !recordingActive && (
          <button type="button" className="media-button" onClick={speech.replay}>
            <Play size={18} aria-hidden="true" /> Les opp igjen
          </button>
        )}
      </div>

      <p className="media-hint">
        Mikrofonen brukes bare mens du tar opp. Opptaket sendes til en talegjenkjenningstjeneste, skrives ut som tekst og lagres ikke.
        Du kan alltid skrive svaret i stedet.
      </p>
    </section>
  );
}
