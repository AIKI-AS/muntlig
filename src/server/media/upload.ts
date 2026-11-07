import { MAX_AUDIO_BYTES } from '@/features/media/types';
import { readForm } from './body';
import { AppError } from '@/server/errors';

export type Container = 'webm' | 'ogg' | 'mp4' | 'wav' | 'mp3';

const MULTIPART_OVERHEAD = 64 * 1024;

function startsWith(bytes: Uint8Array, at: number, ascii: string) {
  return [...ascii].every((char, i) => bytes[at + i] === char.charCodeAt(0));
}

/** Container detection from magic bytes, so a renamed non-audio file is never forwarded to the provider. */
function sniff(bytes: Uint8Array): Container | null {
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (startsWith(bytes, 0, 'OggS')) return 'ogg';
  if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WAVE')) return 'wav';
  if (startsWith(bytes, 4, 'ftyp')) return 'mp4';
  if (startsWith(bytes, 0, 'ID3') || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

/** Multipart {sessionId, audio}. The audio lives only in this request's memory. */
export async function readRecording(request: Request): Promise<{ sessionId: string; audio: Blob; container: Container }> {
  const form = await readForm(request, MAX_AUDIO_BYTES + MULTIPART_OVERHEAD);
  const sessionId = form.get('sessionId');
  const audio = form.get('audio');
  if (typeof sessionId !== 'string' || !(audio instanceof File)) throw new AppError(400, 'Forespørselen er ugyldig.');
  if (audio.size === 0) throw new AppError(422, 'Opptaket er tomt.');
  if (audio.size > MAX_AUDIO_BYTES) throw new AppError(413, 'Opptaket er for stort.');
  const container = sniff(new Uint8Array(await audio.slice(0, 16).arrayBuffer()));
  if (!container) throw new AppError(415, 'Lydformatet støttes ikke.');
  return { sessionId, audio, container };
}
