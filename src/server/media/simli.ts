import { SIMLI_API, type AvatarConfig } from './config';
import { AppError } from '@/server/errors';
import { LIMITS } from '@/lib/limits';
import { readBounded } from './body';

/**
 * Simli Compose, server side: mint a short-lived session token. The browser starts the session with
 * that token (simli-client) and holds the connection; the permanent API key never leaves the server.
 * Docs: https://docs.simli.com/api-reference/compose-session-token.md
 */

const TIMEOUT_MS = 20_000;
const MAX_IDLE_SECONDS = 60;
const MAX_TOKEN_CHARS = 8192;
const MAX_RESPONSE_BYTES = 64 * 1024;
const TOKEN = /^\S+$/;

/** Reads the provider body with a size bound. Anything unreadable or oversized is treated as no body. */
async function readBody(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  try {
    const bytes = await readBounded(response.body, MAX_RESPONSE_BYTES, () => new AppError(502, 'Simli-avataren ga et uventet svar.'));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Extracts the token, or null when the response is not exactly a usable session token. Nothing else is read. */
function parseSessionToken(json: unknown): string | null {
  if (typeof json !== 'object' || json === null || !('session_token' in json)) return null;
  const token = json.session_token;
  return typeof token === 'string' && token.length <= MAX_TOKEN_CHARS && TOKEN.test(token) ? token : null;
}

/** Session token for an audio-to-video Compose session. Provider bodies and errors are never passed on. */
export async function createAvatarToken(config: AvatarConfig): Promise<{ sessionToken: string }> {
  let response: Response;
  try {
    response = await fetch(`${SIMLI_API}/compose/token`, {
      method: 'POST',
      headers: { 'x-simli-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        faceId: config.faceId,
        handleSilence: true,
        audioInputFormat: 'pcm16',
        // A provider-enforced cap survives browser crashes and matches this demo's session limit.
        maxSessionLength: LIMITS.avatarSeconds,
        maxIdleTime: Math.min(MAX_IDLE_SECONDS, LIMITS.avatarSeconds),
      }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError(504, 'Simli-avataren svarte ikke. Bruk tekst eller lyd i stedet.');
  }
  const json = await readBody(response);
  if (!response.ok) {
    if (response.status === 429) throw new AppError(429, 'Simli-avataren er opptatt. Vent litt og prøv igjen.');
    if (response.status === 401 || response.status === 403) throw new AppError(502, 'Simli-avataren er ikke riktig satt opp.');
    throw new AppError(502, 'Simli-avataren feilet. Bruk tekst eller lyd i stedet.');
  }
  const sessionToken = parseSessionToken(json);
  if (!sessionToken) throw new AppError(502, 'Simli-avataren ga et uventet svar. Bruk tekst eller lyd i stedet.');
  return { sessionToken };
}
