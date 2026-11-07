import type { SpeakFormat } from '@/features/media/types';
import { readBounded } from './body';
import type { ElevenLabsConfig, VoiceConfig } from './config';
import { AppError } from '@/server/errors';
import type { Container } from './upload';

/**
 * ElevenLabs adapter. Every URL is built from the validated server config plus fixed paths.
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 *       https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */

const STT_MODEL = 'scribe_v2';
// ElevenLabs documents Norwegian for Scribe v2 as `nor` (ISO 639-3); `nob` is not in the documented list.
const STT_LANGUAGE = 'nor';
const TTS_MODEL = 'eleven_multilingual_v2';
const TIMEOUT_MS = 45_000;

export const MAX_SPEECH_CHARS = 2500;
const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_SPEECH_BYTES = 24 * 1024 * 1024;

// pcm_24000 is raw signed 16-bit little-endian mono; mp3_44100_128 is the documented default and needs no paid tier.
const OUTPUT_FORMAT: Record<SpeakFormat, string> = { mp3: 'mp3_44100_128', pcm: 'pcm_24000' };
const EXTENSION: Record<Container, string> = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', wav: 'wav', mp3: 'mp3' };

async function call(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new AppError(504, 'Taletjenesten svarte ikke. Prøv igjen eller skriv svaret.');
  }
  if (response.ok) return response;
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 429) throw new AppError(429, 'Taletjenesten er opptatt. Vent litt og prøv igjen.');
  if (response.status === 401 || response.status === 403) throw new AppError(502, 'Taletjenesten er ikke riktig satt opp.');
  throw new AppError(502, 'Taletjenesten feilet. Bruk tekst i stedet.');
}

/** Speech to text. `audio` stays in memory and is forwarded once; nothing is stored or logged here. */
export async function transcribe(config: ElevenLabsConfig, audio: Blob, container: Container): Promise<string> {
  const form = new FormData();
  form.set('model_id', STT_MODEL);
  form.set('language_code', STT_LANGUAGE);
  form.set('tag_audio_events', 'false');
  form.set('file', audio, `opptak.${EXTENSION[container]}`);
  const response = await call(`${config.baseUrl}/v1/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': config.apiKey, Accept: 'application/json' },
    body: form,
  });
  const body: unknown = await response.json().catch(() => null);
  const text = typeof body === 'object' && body !== null && 'text' in body && typeof body.text === 'string' ? body.text : null;
  if (text === null) throw new AppError(502, 'Taletjenesten ga et uventet svar.');
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Text to speech for text that already exists as a persisted assistant turn. */
export async function speak(config: VoiceConfig, text: string, format: SpeakFormat) {
  const url = `${config.baseUrl}/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=${OUTPUT_FORMAT[format]}`;
  const response = await call(url, {
    method: 'POST',
    headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: format === 'mp3' ? 'audio/mpeg' : '*/*' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
  });
  const audio = await readBounded(response.body, MAX_SPEECH_BYTES, () => new AppError(502, 'Taletjenesten ga for mye lyd.'));
  if (audio.byteLength === 0 || (format === 'pcm' && audio.byteLength % 2 !== 0)) {
    throw new AppError(502, 'Taletjenesten ga ugyldig lyd.');
  }
  return audio;
}
