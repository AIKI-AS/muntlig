import type { AvatarCredentials, AvatarRequest, SpeakFormat, TranscribeResult } from './types';

/** Thin fetch wrappers for our own /api/media endpoints. The browser never sends credentials or upstream URLs. */

async function fail(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : null;
  throw new Error(message ?? 'Noe gikk galt. Prøv igjen eller bruk tekst.');
}

function postJson(path: string, body: unknown, init?: RequestInit) {
  return fetch(path, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function transcribeRecording(sessionId: string, audio: Blob, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  form.set('sessionId', sessionId);
  form.set('audio', audio, 'opptak');
  const response = await fetch('/api/media/transcribe', { method: 'POST', body: form, signal });
  if (!response.ok) return fail(response);
  return ((await response.json()) as TranscribeResult).text;
}

export async function fetchSpeech(sessionId: string, turnId: string, format: SpeakFormat, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await postJson('/api/media/speak', { sessionId, turnId, format }, { signal });
  if (!response.ok) return fail(response);
  return response.arrayBuffer();
}

export async function requestAvatar(sessionId: string): Promise<AvatarCredentials> {
  const request: AvatarRequest = { action: 'start', sessionId };
  const response = await postJson('/api/media/avatar', request);
  if (!response.ok) return fail(response);
  return (await response.json()) as AvatarCredentials;
}

/** Best effort: ends the provider session even if the SDK could not. `keepalive` lets it survive page unload. */
export async function releaseAvatar(sessionId: string, credentials: AvatarCredentials): Promise<void> {
  const request: AvatarRequest = { action: 'stop', sessionId, avatarSessionId: credentials.avatarSessionId, handle: credentials.handle };
  await postJson('/api/media/avatar', request, { keepalive: true }).catch(() => undefined);
}
