import type { SpeakFormat } from '@/features/media/types';
import { AppError } from '@/server/errors';
import { jsonError, takeQuota } from '@/server/context';
import { readJson } from '@/server/media/body';
import { requireTextToSpeech } from '@/server/media/config';
import { authenticate, openActiveSession } from '@/server/media/access';
import { MAX_SPEECH_CHARS, speak } from '@/server/media/elevenlabs';

export const runtime = 'nodejs';

const HEADERS: Record<SpeakFormat, Record<string, string>> = {
  mp3: { 'Content-Type': 'audio/mpeg' },
  // Raw signed 16-bit little-endian mono at 24 kHz, as LiveAvatar Lite expects (before Base64).
  pcm: { 'Content-Type': 'application/octet-stream', 'X-Audio-Format': 'pcm_s16le_24000_mono' },
};

/**
 * POST {sessionId, turnId, format?} -> audio bytes. The text is read from the persisted assistant turn;
 * the client never supplies text. Default format follows the session: avatar -> pcm, voice -> mp3.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await authenticate(request);
    const body = await readJson(request);
    const session = await openActiveSession(ctx, body.sessionId, ['voice', 'avatar']);
    const format = body.format ?? (session.mode === 'avatar' ? 'pcm' : 'mp3');
    if (format !== 'mp3' && format !== 'pcm') throw new AppError(400, 'Ugyldig lydformat.');
    if (format === 'pcm' && session.mode !== 'avatar') throw new AppError(403, 'Avatarlyd er ikke slått på for denne økten.');
    const turn = session.turns.find((candidate) => candidate.id === body.turnId && candidate.role === 'assistant');
    if (!turn) throw new AppError(404, 'Fant ikke svaret som skal leses opp.');
    const text = turn.text.trim();
    if (!text) throw new AppError(422, 'Svaret har ingen tekst å lese opp.');
    if (text.length > MAX_SPEECH_CHARS) throw new AppError(422, 'Svaret er for langt til å leses opp. Les det på skjermen.');
    const config = requireTextToSpeech();
    await takeQuota(ctx, `media.tts:${ctx.actor.id}`, 60, 600);
    const audio = await speak(config, text, format);
    return new Response(audio, { headers: { ...HEADERS[format], 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return jsonError(error);
  }
}
