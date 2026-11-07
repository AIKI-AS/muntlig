// The private ElevenLabs agent and conversation bound to a session (table session_conversations). The ids are
// written only by the server (JWT RLS plus the server write key) and never come from the browser. One row per
// session: the primary key makes the claim atomic, so concurrent token requests cannot create a second paid agent.
import type { Session } from '@/lib/contracts';
import type { Context } from '@/server/context';
import { AppError } from '@/server/errors';

export type Binding = {
  state: 'creating' | 'bound';
  agentId: string | null;
  conversationId: string | null;
  createdAt: string;
  agentDeletedAt: string | null;
};

type Row = { state: Binding['state']; agent_id: string | null; conversation_id: string | null; created_at: string; agent_deleted_at: string | null };

const COLUMNS = 'state, agent_id, conversation_id, created_at, agent_deleted_at';
const TABLE = 'session_conversations';

const toBinding = (row: Row): Binding => ({
  state: row.state, agentId: row.agent_id, conversationId: row.conversation_id, createdAt: row.created_at, agentDeletedAt: row.agent_deleted_at,
});

const started = () => new AppError(409, 'Samtalen er allerede startet for denne økten. Avslutt økten for å se gjennomgangen, eller start en ny økt.');
const busy = () => new AppError(409, 'Samtalen settes opp akkurat nå. Vent et øyeblikk.');

export async function loadBinding(ctx: Context, sessionId: string): Promise<Binding | null> {
  const { data, error } = await ctx.db.from(TABLE).select(COLUMNS).eq('session_id', sessionId).maybeSingle();
  if (error) throw error;
  return data ? toBinding(data as Row) : null;
}

/** One setup attempt per session. Never transfer an in-flight claim: its original request could still be running. */
export async function claimBinding(ctx: Context, session: Session): Promise<Binding> {
  const inserted = await ctx.db
    .from(TABLE)
    .insert({ session_id: session.id, tenant_id: ctx.actor.tenantId, student_id: ctx.actor.id })
    .select(COLUMNS)
    .single();
  if (!inserted.error) return toBinding(inserted.data as Row);
  if (inserted.error.code === '23505') throw started();
  throw inserted.error;
}

/** Records the new agent before requesting browser access, so failed setup can remove the private prompt. */
export async function recordAgent(ctx: Context, sessionId: string, agentId: string): Promise<void> {
  const { data, error } = await ctx.db
    .from(TABLE)
    .update({ agent_id: agentId })
    .eq('session_id', sessionId)
    .eq('state', 'creating')
    .is('agent_id', null)
    .select('session_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw busy();
}

/** The final step: the conversation id from the provider is fixed for the session and can never change. */
export async function bindConversation(ctx: Context, sessionId: string, agentId: string, conversationId: string): Promise<void> {
  const { data, error } = await ctx.db
    .from(TABLE)
    .update({ state: 'bound', conversation_id: conversationId })
    .eq('session_id', sessionId)
    .eq('state', 'creating')
    .eq('agent_id', agentId)
    .select('session_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw busy();
}

/** Only mark deletion after the provider confirms it; failed cleanup stays available for the next finish request. */
export async function markAgentDeleted(ctx: Context, sessionId: string, agentId: string): Promise<void> {
  const { error } = await ctx.db.from(TABLE)
    .update({ agent_deleted_at: new Date().toISOString() })
    .eq('session_id', sessionId).eq('agent_id', agentId).is('agent_deleted_at', null);
  if (error) throw error;
}

/** A completed voice/avatar session whose recorded provider agent has not been confirmed deleted. */
export function isCleanupPending(session: Session, binding: Binding | null): boolean {
  const live = session.mode === 'voice' || session.mode === 'avatar';
  return live && session.status === 'completed' && !!binding?.agentId && !binding.agentDeletedAt;
}
