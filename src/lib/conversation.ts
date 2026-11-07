// Shared contract for live voice conversations (ElevenLabs Agents). Pure types and guards, safe to import in the
// browser: no server code, no secrets.
//
// Flow
//   1. POST /api/sessions { packId, mode: 'voice' | 'avatar', plan? } -> Session (turns: [], activeGoalId = first selected goal)
//   2. POST /api/sessions/:id/conversation      no body                    -> ConversationAccess
//        Creates a private, single-use ElevenLabs agent bound to this session's immutable pack snapshot, then
//        returns access for the session's mode: voice -> WebRTC token, avatar -> single-use WebSocket signed URL
//        (PCM 24 kHz agent audio with exact interruption boundaries, resampled to 16 kHz for Simli).
//        The client passes NO prompt, first message, language, voice, overrides or dynamic variables: all client
//        overrides are disabled on the agent. The server fixes the conversation id; the client never supplies one.
//        401 not signed in | 403 not a voice or avatar session | 404 unknown session or not yours (RLS hides it)
//        409 session finished, a conversation was already started (one per session, no reconnect), or setup is in
//        progress (a double click) | 429 quota | 502 provider failure | 503 ElevenLabs not enabled
//   3. Browser SDK (@elevenlabs/client) connects. clientTools: show_goal and record_evidence. Their callbacks drive
//        the live preview ONLY.
//   4. POST /api/sessions/:id/finish            no body                    -> Review
//        The server fetches its OWN transcript for the bound conversation from ElevenLabs and rebuilds turns, goal
//        order and evidence from it. Nothing the browser reports is trusted.
//        425 the conversation is still running or being processed at ElevenLabs: end the SDK session, then ask again.
//        There is no endpoint that accepts a transcript from the browser.
//
// While a voice or avatar session is active, Session.turns / evidence / activeGoalId stay as created. They are
// written once, by finish, from the provider transcript. Text turn/next endpoints reject these sessions with 409.
import type { Goal } from './contracts';
import { LIMITS } from './limits';

/** SDK `serverLocation` values; derived on the server from the validated ElevenLabs base URL. */
export type VoiceServerLocation = 'us' | 'eu-residency' | 'in-residency' | 'global';

type ConversationBinding = {
  /** Provider conversation id, fixed by the server and bound to the session. Only for display and the SDK. */
  conversationId: string;
  serverLocation: VoiceServerLocation;
};

/** voice mode: Conversation.startSession({ conversationToken, connectionType: 'webrtc' }). */
export type WebRtcConversationAccess = ConversationBinding & { connectionType: 'webrtc'; conversationToken: string };

/** avatar mode: Conversation.startSession({ signedUrl, connectionType: 'websocket' }). Single use. */
export type WebSocketConversationAccess = ConversationBinding & { connectionType: 'websocket'; signedUrl: string };

/** Response of POST /api/sessions/:id/conversation. */
export type ConversationAccess = WebRtcConversationAccess | WebSocketConversationAccess;

export const SHOW_GOAL_TOOL = 'show_goal';
export const RECORD_EVIDENCE_TOOL = 'record_evidence';

export type EvidenceClaimStatus = 'independent' | 'with_hint';

/** show_goal({ goalId }): the agent says which of the selected pinned goals it is working on. */
export type ShowGoalCall = { goalId: string };

/**
 * record_evidence({ goalId, quote, status, sourceIds }): the agent claims the student explained the goal.
 * `quote` must be the student's own words. `status` is only a claim: the server never lets it be more
 * independent than the transcript supports.
 */
export type RecordEvidenceCall = {
  goalId: string;
  quote: string;
  status: EvidenceClaimStatus;
  sourceIds: string[];
};

type PackGoals = { goals: Goal[] };

/** Whitespace is collapsed so that spoken text, quotes and stored turns compare literally. */
export const normalizeSpeech = (text: string): string => text.replace(/\s+/g, ' ').trim();

function asRecord(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Accepts the SDK's object or the provider's `params_as_json` string. Null when invalid or not a pack goal. */
export function parseShowGoal(raw: unknown, pack: PackGoals): ShowGoalCall | null {
  const params = asRecord(raw);
  if (!params || typeof params.goalId !== 'string') return null;
  const goalId = params.goalId;
  return pack.goals.some((goal) => goal.id === goalId) ? { goalId } : null;
}

/**
 * Shape, goal, quote length and source allowlist checks against the pack. It cannot know whether the quote
 * is really in the transcript: the server additionally checks that against its own provider transcript.
 */
export function parseRecordEvidence(raw: unknown, pack: PackGoals): RecordEvidenceCall | null {
  const params = asRecord(raw);
  if (!params) return null;
  const { goalId, quote, status, sourceIds } = params;
  if (typeof goalId !== 'string' || typeof quote !== 'string') return null;
  if (status !== 'independent' && status !== 'with_hint') return null;
  const goal = pack.goals.find((item) => item.id === goalId);
  if (!goal || !Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.length > goal.sourceIds.length) return null;
  const refs = sourceIds.every((id) => typeof id === 'string' && goal.sourceIds.includes(id)) ? [...new Set(sourceIds as string[])] : null;
  const clean = normalizeSpeech(quote);
  if (!refs || clean.length < LIMITS.quoteMin || clean.length > LIMITS.quote) return null;
  return { goalId, quote: clean, status, sourceIds: refs };
}
