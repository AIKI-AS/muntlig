import { AppError } from '@/server/errors';
import type { ProviderEntry } from '@/server/voice/rebuild';
import { readBounded } from './body';
import type { AgentsConfig } from './config';

/**
 * ElevenLabs Agents adapter: create one private agent, get access for it, read back its transcript.
 * Every URL is built from the validated server config plus fixed paths; every response is untrusted and parsed here.
 * Docs: https://elevenlabs.io/docs/api-reference/agents/create
 *       https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
 *       https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
 *       https://elevenlabs.io/docs/api-reference/conversations/get
 *       https://elevenlabs.io/docs/api-reference/agents/delete
 */

const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const PROVIDER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SIGNED_PATH = '/v1/convai/conversation';

type Json = Record<string, unknown>;

const unexpected = () => new AppError(502, 'ElevenLabs ga et uventet svar. Prøv igjen om litt.');
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The provider has no such resource (a 404). Reads treat it as "not there yet"; anywhere else it is a plain 502. */
class ProviderMissing extends AppError {
  constructor() {
    super(502, 'ElevenLabs fant ikke det som ble bundet til økten.');
  }
}

async function request(config: AgentsConfig, path: string, init: RequestInit = {}): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { 'xi-api-key': config.apiKey, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError(504, 'ElevenLabs svarte ikke. Prøv igjen om litt.');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 404) throw new ProviderMissing();
    if (response.status === 429) throw new AppError(429, 'ElevenLabs er opptatt. Vent litt og prøv igjen.');
    if (response.status === 401 || response.status === 403) throw new AppError(502, 'ElevenLabs er ikke riktig satt opp.');
    throw new AppError(502, 'ElevenLabs feilet. Prøv igjen om litt.');
  }
  if (init.method === 'DELETE') {
    await response.body?.cancel().catch(() => undefined);
    return {};
  }
  const bytes = await readBounded(response.body, MAX_RESPONSE_BYTES, unexpected);
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (isRecord(body)) return body;
  } catch {
    // falls through
  }
  throw unexpected();
}

const providerId = (value: unknown): string => {
  const id = text(value);
  if (!id || !PROVIDER_ID.test(id)) throw unexpected();
  return id;
};

/** POST /v1/convai/agents/create. Returns the new agent id. */
export async function createAgent(config: AgentsConfig, body: unknown): Promise<string> {
  const created = await request(config, '/v1/convai/agents/create', { method: 'POST', body: JSON.stringify(body) });
  return providerId(created.agent_id);
}

/** Removes only our session's private agent. A repeat cleanup after a lost response is harmless. */
export async function deleteAgent(config: AgentsConfig, agentId: string): Promise<void> {
  try {
    await request(config, `/v1/convai/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } catch (error) {
    if (!(error instanceof ProviderMissing)) throw error;
  }
}

/** GET /v1/convai/conversation/token: WebRTC token and the id of the conversation it creates. */
export async function getWebRtcAccess(config: AgentsConfig, agentId: string): Promise<{ token: string; conversationId: string }> {
  const got = await request(config, `/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`);
  const token = text(got.token);
  if (!token || token.length > 8192) throw unexpected();
  return { token, conversationId: providerId(got.conversation_id) };
}

/**
 * GET /v1/convai/conversation/get-signed-url with include_conversation_id: a single-use WebSocket URL.
 * The docs do not name the id field, so it is accepted from a top-level `conversation_id` (as on the token endpoint)
 * or from one `conversation_id` query parameter on the URL; if both are present they must be equal. No id means no
 * access: nothing is guessed, and the URL must point at the configured ElevenLabs host and this agent.
 */
export async function getSignedUrlAccess(config: AgentsConfig, agentId: string): Promise<{ signedUrl: string; conversationId: string }> {
  const query = `agent_id=${encodeURIComponent(agentId)}&include_conversation_id=true`;
  const got = await request(config, `/v1/convai/conversation/get-signed-url?${query}`);
  const signedUrl = text(got.signed_url);
  if (!signedUrl || signedUrl.length > 8192) throw unexpected();
  let url: URL;
  try {
    url = new URL(signedUrl);
  } catch {
    throw unexpected();
  }
  const clean = url.protocol === 'wss:' && url.hostname === new URL(config.baseUrl).hostname && !url.username && !url.password
    && !url.port && url.pathname === SIGNED_PATH && !url.hash;
  if (!clean || url.searchParams.get('agent_id') !== agentId) throw unexpected();
  const fromUrl = url.searchParams.getAll('conversation_id');
  if (fromUrl.length > 1) throw unexpected();
  const topLevel = got.conversation_id === undefined ? undefined : providerId(got.conversation_id);
  const urlId = fromUrl.length === 1 ? providerId(fromUrl[0]) : undefined;
  const conversationId = topLevel ?? urlId;
  if (!conversationId) throw new AppError(502, 'ElevenLabs ga ikke samtale-ID for avatarsamtalen. Bruk tekst eller prøv senere.');
  if (topLevel && urlId && topLevel !== urlId) throw unexpected();
  return { signedUrl, conversationId };
}

export type ProviderConversation = {
  agentId: string;
  conversationId: string;
  status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
  startedAtMs: number | null;
  entries: ProviderEntry[];
};

const STATUSES: Record<string, true> = { initiated: true, 'in-progress': true, processing: true, done: true, failed: true };

function toEntry(raw: unknown): ProviderEntry | null {
  if (!isRecord(raw) || (raw.role !== 'user' && raw.role !== 'agent')) return null;
  const calls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
  return {
    role: raw.role,
    message: text(raw.message),
    timeInCallSecs: typeof raw.time_in_call_secs === 'number' && Number.isFinite(raw.time_in_call_secs) ? raw.time_in_call_secs : 0,
    interrupted: raw.interrupted === true,
    ignoredAsBackchannel: raw.ignored_as_backchannel === true,
    platformEvent: typeof raw.platform_event === 'string',
    sourceMedium: text(raw.source_medium),
    toolCalls: calls.flatMap((call) => (isRecord(call) && typeof call.tool_name === 'string'
      ? [{ name: call.tool_name, params: call.params_as_json }] : [])),
  };
}

/** GET /v1/convai/conversations/{id}: status, owning agent and the chronological transcript. Null if the provider has no such conversation. */
export async function getConversation(config: AgentsConfig, conversationId: string): Promise<ProviderConversation | null> {
  let got: Json;
  try {
    got = await request(config, `/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
  } catch (error) {
    if (error instanceof ProviderMissing) return null;
    throw error;
  }
  const status = text(got.status);
  if (!status || !Object.hasOwn(STATUSES, status) || !Array.isArray(got.transcript) || got.transcript.length > MAX_ENTRIES) throw unexpected();
  const start = isRecord(got.metadata) ? got.metadata.start_time_unix_secs : null;
  return {
    agentId: providerId(got.agent_id),
    conversationId: providerId(got.conversation_id),
    status: status as ProviderConversation['status'],
    startedAtMs: typeof start === 'number' && Number.isFinite(start) ? start * 1000 : null,
    entries: got.transcript.flatMap((raw) => toEntry(raw) ?? []),
  };
}
