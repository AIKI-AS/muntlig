import { takeQuota, jsonError } from '@/server/context';
import { AppError } from '@/server/errors';
import { requireSpeechToText } from '@/server/media/config';
import { authenticate, openActiveSession } from '@/server/media/access';
import { transcribe } from '@/server/media/elevenlabs';
import { readRecording } from '@/server/media/upload';

export const runtime = 'nodejs';

/** POST multipart {sessionId, audio} -> {text}. The recording is held in memory for this request only. */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await authenticate(request);
    const { sessionId, audio, container } = await readRecording(request);
    await openActiveSession(ctx, sessionId, ['voice', 'avatar']);
    const config = requireSpeechToText();
    await takeQuota(ctx, `media.stt:${ctx.actor.id}`, 30, 600);
    const text = await transcribe(config, audio, container);
    if (!text) throw new AppError(422, 'Fant ingen tale i opptaket. Prøv igjen eller skriv svaret.');
    return Response.json({ text });
  } catch (error) {
    return jsonError(error);
  }
}
