import { createHmac, timingSafeEqual } from 'node:crypto';
import { LIVEAVATAR_API, type AvatarConfig } from './config';
import { AppError } from '@/server/errors';

/**
 * LiveAvatar Lite, server side: mint a session-scoped token and stop sessions. The browser starts
 * the session itself with the token (SDK `LiveAvatarSession`, POST /v1/sessions/start) and holds the
 * websocket. Docs: https://docs.liveavatar.com/docs/lite-mode/lifecycle.md
 *                  https://docs.liveavatar.com/api-reference/sessions/create-session-token.md
 *                  https://docs.liveavatar.com/api-reference/sessions/stop-session.md
 */

const TIMEOUT_MS = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAvatarSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

async function call(config: AvatarConfig, path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${LIVEAVATAR_API}${path}`, {
      method: 'POST',
      headers: { 'X-API-KEY': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError(504, 'Avatartjenesten svarte ikke. Bruk tekst eller lyd i stedet.');
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return json;
  if (response.status === 429) throw new AppError(429, 'Avatartjenesten er opptatt. Vent litt og prøv igjen.');
  if (response.status === 401 || response.status === 403) throw new AppError(502, 'Avatartjenesten er ikke riktig satt opp.');
  throw new AppError(502, 'Avatartjenesten feilet. Bruk tekst eller lyd i stedet.');
}

/** Ends the provider session. Idempotent from our point of view. */
export async function stopAvatarSession(config: AvatarConfig, avatarSessionId: string): Promise<void> {
  await call(config, '/v1/sessions/stop', { session_id: avatarSessionId, reason: 'USER_CLOSED' });
}

/** LITE-mode session token; the avatar only starts when the browser starts the session with it. */
export async function createAvatarToken(config: AvatarConfig): Promise<{ avatarSessionId: string; sessionToken: string }> {
  const json = await call(config, '/v1/sessions/token', { mode: 'LITE', avatar_id: config.avatarId });
  const data = typeof json === 'object' && json !== null && 'data' in json ? json.data : null;
  const id = typeof data === 'object' && data !== null && 'session_id' in data ? data.session_id : null;
  const token = typeof data === 'object' && data !== null && 'session_token' in data ? data.session_token : null;
  if (isAvatarSessionId(id) && typeof token === 'string' && token) return { avatarSessionId: id, sessionToken: token };
  // A session id without a usable token must not be left behind.
  if (isAvatarSessionId(id)) await stopAvatarSession(config, id).catch(() => undefined);
  throw new AppError(502, 'Avatartjenesten ga et uventet svar. Bruk tekst eller lyd i stedet.');
}

/** Stateless proof that this user minted this avatar session for this practice session. Keyed with the server-only API key. */
function handleFor(config: AvatarConfig, actorId: string, sessionId: string, avatarSessionId: string): Buffer {
  return createHmac('sha256', config.apiKey).update(`muntlig-avatar-v1|${actorId}|${sessionId}|${avatarSessionId}`).digest();
}

export function signHandle(config: AvatarConfig, actorId: string, sessionId: string, avatarSessionId: string): string {
  return handleFor(config, actorId, sessionId, avatarSessionId).toString('base64url');
}

export function verifyHandle(config: AvatarConfig, actorId: string, sessionId: string, avatarSessionId: string, handle: unknown): boolean {
  if (typeof handle !== 'string') return false;
  const given = Buffer.from(handle, 'base64url');
  const expected = handleFor(config, actorId, sessionId, avatarSessionId);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
