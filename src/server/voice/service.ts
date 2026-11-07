// Live conversation flow for voice and avatar sessions. Two server-side steps, neither trusts the browser:
//   openConversation: private per-session agent + provider-issued access, bound to the session before it is returned.
//   readTranscript:   the server's own authenticated transcript of the bound conversation, rebuilt into turns/evidence.
import type { ConversationAccess } from '@/lib/conversation';
import type { Session } from '@/lib/contracts';
import { practiceGoals } from '@/lib/practice-plan';
import { takeQuota, type Context } from '@/server/context';
import { AppError } from '@/server/errors';
import { createAgent, deleteAgent, getConversation, getSignedUrlAccess, getWebRtcAccess } from '@/server/media/agents';
import { requireAgents, requireAgentsRead } from '@/server/media/config';
import { bindConversation, claimBinding, isCleanupPending, loadBinding, markAgentDeleted, recordAgent } from './binding';
import { rebuildFromTranscript, type Rebuilt } from './rebuild';
import { buildAgentRequest, maxDurationSeconds } from './spec';

// A conversation older than its hard cap plus this is over for good, whatever state the provider still reports.
const EXPIRY_SLACK_SECONDS = 300;

export const isLiveMode = (session: Session): boolean => session.mode === 'voice' || session.mode === 'avatar';

export async function openConversation(ctx: Context, session: Session): Promise<ConversationAccess> {
  if (session.status !== 'active') throw new AppError(409, 'Økten er avsluttet.');
  if (!isLiveMode(session)) throw new AppError(403, 'Denne økten er en tekstøkt og har ingen stemmesamtale.');
  const config = requireAgents();

  await takeQuota(ctx, 'conversation', 10, 3600);
  await claimBinding(ctx, session);
  let agentId: string | null = null;
  try {
    agentId = await createAgent(config, buildAgentRequest(session, config.voiceId));
    await recordAgent(ctx, session.id, agentId);
    const base = { serverLocation: config.serverLocation } as const;
    let access: ConversationAccess;
    if (session.mode === 'avatar') {
      const got = await getSignedUrlAccess(config, agentId);
      access = { ...base, connectionType: 'websocket', signedUrl: got.signedUrl, conversationId: got.conversationId };
    } else {
      const got = await getWebRtcAccess(config, agentId);
      access = { ...base, connectionType: 'webrtc', conversationToken: got.token, conversationId: got.conversationId };
    }
    await bindConversation(ctx, session.id, agentId, access.conversationId);
    return access;
  } catch (error) {
    if (agentId) {
      try {
        await deleteAgent(config, agentId);
        await markAgentDeleted(ctx, session.id, agentId);
      } catch {
        throw new AppError(502, 'Oppstart og opprydding hos ElevenLabs feilet. Avslutt økten og bruk «Prøv opprydding igjen» på gjennomgangen.');
      }
    }
    throw error;
  }
}

/** Run only after the transcript is saved. Failure leaves the review intact and finish can retry cleanup. */
export async function cleanupConversation(ctx: Context, session: Session): Promise<void> {
  if (!isLiveMode(session)) return;
  const binding = await loadBinding(ctx, session.id);
  if (!binding?.agentId || binding.agentDeletedAt) return;
  if (session.status !== 'completed') throw new AppError(409, 'Økten må avsluttes før samtaleagenten kan ryddes.');
  try {
    await deleteAgent(requireAgentsRead(), binding.agentId);
    await markAgentDeleted(ctx, session.id, binding.agentId);
  } catch {
    throw new AppError(502, 'Gjennomgangen er lagret, men opprydding hos ElevenLabs feilet. Bruk «Prøv opprydding igjen» på gjennomgangen.');
  }
}

/** Read-only: never deletes. Used by GET /review so a failed cleanup stays visible and retryable. */
export async function loadCleanupPending(ctx: Context, session: Session): Promise<boolean> {
  if (!isLiveMode(session) || session.status !== 'completed') return false;
  return isCleanupPending(session, await loadBinding(ctx, session.id));
}

const empty = (session: Session): Rebuilt => ({ turns: [], evidence: [], activeGoalId: practiceGoals(session)[0].id });

/**
 * What the provider says happened in this session's bound conversation. A session that never got a conversation
 * finishes empty (every goal stays unexplored). A conversation that is still running or being processed is a 425,
 * never a completed session: finishing must not discard evidence that has not been written yet.
 */
export async function readTranscript(ctx: Context, session: Session): Promise<Rebuilt> {
  const binding = await loadBinding(ctx, session.id);
  if (!binding || binding.state !== 'bound' || !binding.agentId || !binding.conversationId) return empty(session);

  const config = requireAgentsRead();
  const expired = Date.now() - new Date(binding.createdAt).getTime() > (maxDurationSeconds(session) + EXPIRY_SLACK_SECONDS) * 1000;
  const conversation = await getConversation(config, binding.conversationId);
  if (!conversation) {
    if (expired) return empty(session); // the browser never connected and the token is long dead
    throw new AppError(425, 'ElevenLabs har ikke samtalen ennå. Vent litt og hent gjennomgangen på nytt.');
  }
  if (conversation.agentId !== binding.agentId || conversation.conversationId !== binding.conversationId) {
    throw new AppError(502, 'Samtalen hos ElevenLabs hører ikke til denne økten.');
  }
  if (conversation.status !== 'done' && conversation.status !== 'failed' && !expired) {
    throw new AppError(425, 'Samtalen behandles fortsatt hos ElevenLabs. Avslutt samtalen og hent gjennomgangen på nytt om litt.');
  }
  return rebuildFromTranscript(session, conversation.entries, conversation.startedAtMs ?? new Date(session.startedAt).getTime());
}
