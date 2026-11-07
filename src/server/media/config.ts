import { AppError } from '@/server/errors';

/**
 * Provider configuration. Everything is read from the server environment on every call
 * and fails closed: provider calls need PROVIDER_CALLS_ENABLED=true in addition to keys.
 * Nothing here comes from the client.
 */

// Documented ElevenLabs API hosts (data residency variants), https://elevenlabs.io/docs/api-reference/text-to-speech/convert
const ELEVENLABS_HOSTS: Record<string, true> = {
  'api.elevenlabs.io': true,
  'api.us.elevenlabs.io': true,
  'api.eu.residency.elevenlabs.io': true,
  'api.in.residency.elevenlabs.io': true,
  'api.sg.residency.elevenlabs.io': true,
};
const ELEVENLABS_DEFAULT = 'https://api.elevenlabs.io';
export const LIVEAVATAR_API = 'https://api.liveavatar.com';

const VOICE_ID = /^[A-Za-z0-9]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ElevenLabsConfig = { apiKey: string; baseUrl: string };
export type VoiceConfig = ElevenLabsConfig & { voiceId: string };
export type AvatarConfig = { apiKey: string; avatarId: string };

function providerCallsEnabled(): boolean {
  return process.env.PROVIDER_CALLS_ENABLED === 'true';
}

function readElevenLabs(): ElevenLabsConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  let url: URL;
  try {
    url = new URL(process.env.ELEVENLABS_BASE_URL?.trim() || ELEVENLABS_DEFAULT);
  } catch {
    return null;
  }
  const clean = url.protocol === 'https:' && !url.username && !url.password && !url.port
    && url.pathname === '/' && !url.search && !url.hash;
  if (!clean || !Object.hasOwn(ELEVENLABS_HOSTS, url.hostname)) return null;
  return { apiKey, baseUrl: url.origin };
}

function readVoice(): VoiceConfig | null {
  const base = readElevenLabs();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  return base && voiceId && VOICE_ID.test(voiceId) ? { ...base, voiceId } : null;
}

function readAvatar(): AvatarConfig | null {
  const apiKey = process.env.LIVEAVATAR_API_KEY?.trim();
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID?.trim();
  return apiKey && avatarId && UUID.test(avatarId) ? { apiKey, avatarId } : null;
}

/** For Bootstrap.integrations. Avatar speech is ElevenLabs audio, so it needs voice as well. */
export function mediaAvailability(): { voice: boolean; avatar: boolean } {
  const voice = providerCallsEnabled() && readVoice() !== null;
  return { voice, avatar: voice && readAvatar() !== null };
}

function blocked(what: string): AppError {
  return new AppError(503, `${what} er ikke aktivert på denne serveren. Bruk tekst i stedet.`);
}

/** Speech-to-text needs the key only. */
export function requireSpeechToText(): ElevenLabsConfig {
  const config = providerCallsEnabled() ? readElevenLabs() : null;
  if (!config) throw blocked('Talegjenkjenning');
  return config;
}

export function requireTextToSpeech(): VoiceConfig {
  const config = providerCallsEnabled() ? readVoice() : null;
  if (!config) throw blocked('Opplesing');
  return config;
}

/** Starting an avatar costs credits: provider calls enabled, avatar config and voice config all required. */
export function requireAvatarStart(): AvatarConfig {
  const config = providerCallsEnabled() && readVoice() ? readAvatar() : null;
  if (!config) throw blocked('Avatar');
  return config;
}

/** Stopping only ends a paid session, so it does not need the provider switch, only the key. */
export function requireAvatarStop(): AvatarConfig {
  const config = readAvatar();
  if (!config) throw blocked('Avatar');
  return config;
}
