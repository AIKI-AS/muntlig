import type { VoiceServerLocation } from '@/lib/conversation';
import { AppError } from '@/server/errors';

/**
 * Provider configuration. Everything is read from the server environment on every call
 * and fails closed: provider calls need PROVIDER_CALLS_ENABLED=true in addition to keys.
 * Nothing here comes from the client.
 */

// Documented ElevenLabs API hosts (data residency variants) and the browser SDK `serverLocation` of each.
// The Singapore residency host has no SDK location, so live conversations are unavailable there.
const SDK_LOCATION: Record<string, VoiceServerLocation | null> = {
  'api.elevenlabs.io': 'global',
  'api.us.elevenlabs.io': 'us',
  'api.eu.residency.elevenlabs.io': 'eu-residency',
  'api.in.residency.elevenlabs.io': 'in-residency',
  'api.sg.residency.elevenlabs.io': null,
};
const ELEVENLABS_DEFAULT = 'https://api.elevenlabs.io';
export const LIVEAVATAR_API = 'https://api.liveavatar.com';

const VOICE_ID = /^[A-Za-z0-9]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ElevenLabsConfig = { apiKey: string; baseUrl: string };
/** Live conversation: the key plus a region the browser SDK supports. The voice id is optional (agent default voice otherwise). */
export type AgentsConfig = ElevenLabsConfig & { serverLocation: VoiceServerLocation; voiceId: string | null };
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
  if (!clean || !Object.hasOwn(SDK_LOCATION, url.hostname)) return null;
  return { apiKey, baseUrl: url.origin };
}

function readAvatar(): AvatarConfig | null {
  const apiKey = process.env.LIVEAVATAR_API_KEY?.trim();
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID?.trim();
  return apiKey && avatarId && UUID.test(avatarId) ? { apiKey, avatarId } : null;
}

function readAgents(): AgentsConfig | null {
  const base = readElevenLabs();
  const serverLocation = base ? SDK_LOCATION[new URL(base.baseUrl).hostname] : null;
  if (!base || !serverLocation) return null;
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (voiceId && !VOICE_ID.test(voiceId)) return null; // an odd value disables the feature rather than silently changing the voice
  return { ...base, serverLocation, voiceId: voiceId || null };
}

/**
 * For Bootstrap.integrations. `voice` is a live ElevenLabs Agents conversation: it needs the provider switch and
 * the key, never an OpenAI key or a precreated agent. `avatar` adds the HeyGen LiveAvatar, which only lip-syncs
 * the ElevenLabs audio, so it needs the same conversation.
 */
export function mediaAvailability(): { voice: boolean; avatar: boolean } {
  const on = providerCallsEnabled();
  return { voice: on && readAgents() !== null, avatar: on && readAgents() !== null && readAvatar() !== null };
}

function blocked(what: string): AppError {
  return new AppError(503, `${what} er ikke aktivert på denne serveren. Bruk tekst i stedet.`);
}

/** Live conversation: creates a per-session agent and fetches its token. Costs money, so the provider switch is required. */
export function requireAgents(): AgentsConfig {
  const config = providerCallsEnabled() ? readAgents() : null;
  if (!config) throw blocked('Stemmesamtale med ElevenLabs');
  return config;
}

/** Reading the transcript of an existing conversation costs nothing, so finishing works with the key alone. */
export function requireAgentsRead(): AgentsConfig {
  const config = readAgents();
  if (!config) throw blocked('Stemmesamtale med ElevenLabs');
  return config;
}

/** Starting an avatar costs credits and needs a live ElevenLabs conversation: provider switch, Agents and LiveAvatar config. */
export function requireAvatarStart(): AvatarConfig {
  const config = providerCallsEnabled() && readAgents() ? readAvatar() : null;
  if (!config) throw blocked('Avatar med HeyGen LiveAvatar og ElevenLabs');
  return config;
}

/** Stopping only ends a paid session, so it does not need the provider switch, only the key. */
export function requireAvatarStop(): AvatarConfig {
  const config = readAvatar();
  if (!config) throw blocked('Avatar');
  return config;
}
