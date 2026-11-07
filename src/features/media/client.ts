import type { AvatarCredentials, AvatarRequest } from './types';

/** Thin fetch wrappers for our own /api/media endpoints. The browser never sends credentials or upstream URLs. */

async function fail(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : null;
  throw new Error(message ?? 'Noe gikk galt. Prøv igjen eller bruk tekst.');
}

function postJson(path: string, body: unknown) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Returns only the session token: nothing else from the response reaches the Simli SDK or the page state. */
export async function requestAvatar(sessionId: string): Promise<AvatarCredentials> {
  const request: AvatarRequest = { action: 'start', sessionId };
  const response = await postJson('/api/media/avatar', request);
  if (!response.ok) return fail(response);
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('sessionToken' in body) || typeof body.sessionToken !== 'string' || !body.sessionToken) {
    throw new Error('Avataren kunne ikke startes. Bruk tekst i stedet.');
  }
  return { sessionToken: body.sessionToken };
}
