// Øktflyt: every write is read -> (model call) -> pure domain transition -> one compare-and-set update.
// If the model call or validation fails nothing was written; if another request won the race the
// revision no longer matches and this one gets 409 instead of overwriting.
import type { PracticeMode, PracticePlan, Review, Session, SessionPage } from '../lib/contracts';
import type { ConversationAccess } from '../lib/conversation';
import { takeQuota, type Context } from './context';
import { addQuestion, applyReply, buildReview, completeSession, nextGoal, startSession } from './domain';
import { integrations, requireLlm } from './env';
import { AppError } from './errors';
import { askQuestion, askReply } from './llm';
import { SESSION_COLUMNS, toPack, PACK_COLUMNS, toSession } from './rows';
import { sessionCursorSchema, uuidSchema } from './schemas';
import { cleanupConversation, isLiveMode, loadCleanupPending, openConversation, readTranscript } from './voice/service';

const notFound = () => new AppError(404, 'Fant ikke økten.');
const conflict = () => new AppError(409, 'Økten ble endret et annet sted. Last den på nytt.');
const liveSession = () => new AppError(409, 'Denne økten er en samtaleøkt. Svarene kommer fra stemmesamtalen, ikke fra tekstfeltet.');

async function load(ctx: Context, id: string): Promise<{ session: Session; revision: number }> {
  if (!uuidSchema.safeParse(id).success) throw notFound();
  const { data, error } = await ctx.db.from('practice_sessions').select(SESSION_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return toSession(data);
}

/** Owner-only via RLS: another student's or tenant's id looks exactly like a missing one. */
export async function getSession(ctx: Context, id: string): Promise<Session> {
  return (await load(ctx, id)).session;
}

export async function pageSessions(ctx: Context, cursor?: string): Promise<SessionPage> {
  // RLS remains the owner/tenant boundary. The pair also orders sessions sharing a timestamp.
  let query = ctx.db.from('practice_sessions').select(SESSION_COLUMNS)
    .order('started_at', { ascending: false }).order('id', { ascending: false }).limit(21);
  if (cursor !== undefined) {
    let position;
    try {
      if (!cursor || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('cursor');
      position = sessionCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    } catch {
      throw new AppError(400, 'Ugyldig historikkposisjon. Last siden på nytt.');
    }
    query = query.or(`started_at.lt.${position.startedAt},and(started_at.eq.${position.startedAt},id.lt.${position.id})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const sessions = data.slice(0, 20).map(row => toSession(row).session);
  const last = sessions.at(-1);
  const nextCursor = data.length > 20 && last
    ? Buffer.from(JSON.stringify({ startedAt: last.startedAt, id: last.id })).toString('base64url') : null;
  return { sessions, nextCursor };
}

export async function listSessions(ctx: Context): Promise<Session[]> {
  return (await pageSessions(ctx)).sessions;
}

async function save(ctx: Context, next: Session, revision: number): Promise<Session> {
  const { data, error } = await ctx.db
    .from('practice_sessions')
    .update({ turns: next.turns, evidence: next.evidence, active_goal_id: next.activeGoalId, status: next.status, ended_at: next.endedAt })
    .eq('id', next.id)
    .eq('revision', revision)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw conflict();
  return toSession(data).session;
}

export async function createSession(ctx: Context, packId: string, mode: PracticeMode, plan?: PracticePlan): Promise<Session> {
  // Students practise any published pack of their school; teachers only preview their own packs.
  if (mode === 'voice' && !integrations().voice) {
    throw new AppError(503, 'Stemmesamtale krever ElevenLabs, og den er ikke aktivert i dette miljøet. Bruk tekst.');
  }
  if (mode === 'avatar' && !integrations().avatar) {
    throw new AppError(503, 'Avatar krever ElevenLabs (stemme) og HeyGen LiveAvatar, og de er ikke aktivert i dette miljøet. Bruk tekst.');
  }
  let query = ctx.db.from('packs').select(PACK_COLUMNS).eq('id', packId).eq('status', 'published');
  if (ctx.actor.role === 'teacher') query = query.eq('created_by', ctx.actor.id);
  const found = await query.maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) throw new AppError(404, 'Fant ikke fagpakken.');
  // Voice and avatar run on ElevenLabs Agents: no OpenAI call, and no opener turn (the agent speaks it).
  // Their turns and evidence are written once, at finish, from the provider transcript.
  const live = mode !== 'text';
  if (!live) requireLlm();
  await takeQuota(ctx, 'session-create', 10, 3600);

  const started = startSession(toPack(found.data), mode, plan);
  const opened = live ? started : addQuestion(started, await askQuestion(started));
  const { data, error } = await ctx.db
    .from('practice_sessions')
    .insert({
      id: opened.id,
      tenant_id: ctx.actor.tenantId,
      student_id: ctx.actor.id,
      pack_id: opened.packId,
      pack_version: opened.packVersion,
      pack: opened.pack,
      plan: opened.plan,
      mode: opened.mode,
      status: opened.status,
      turns: opened.turns,
      evidence: opened.evidence,
      active_goal_id: opened.activeGoalId,
      started_at: opened.startedAt,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return toSession(data).session;
}

export async function takeTurn(ctx: Context, id: string, text: string, expectedTurnCount: number): Promise<Session> {
  // Ownership is enforced by RLS in load().
  const { session, revision } = await load(ctx, id);
  if (isLiveMode(session)) throw liveSession();
  if (session.status !== 'active') throw new AppError(409, 'Økten er avsluttet.');
  if (session.turns.length !== expectedTurnCount) throw conflict();
  requireLlm();
  await takeQuota(ctx, 'turn', 60, 3600);
  const next = applyReply(session, text, await askReply(session, text));
  return save(ctx, next, revision);
}

export async function moveToNextGoal(ctx: Context, id: string): Promise<Session> {
  // Ownership is enforced by RLS in load().
  const { session, revision } = await load(ctx, id);
  if (isLiveMode(session)) throw liveSession();
  const moved = nextGoal(session);
  requireLlm();
  await takeQuota(ctx, 'next-goal', 30, 3600);
  return save(ctx, addQuestion(moved, await askQuestion(moved)), revision);
}

export async function finishSession(ctx: Context, id: string): Promise<Review> {
  // Ownership is enforced by RLS in load().
  const { session, revision } = await load(ctx, id);
  if (session.status === 'completed') {
    await cleanupConversation(ctx, session);
    return buildReview(session);
  }
  if (!isLiveMode(session)) return buildReview(await save(ctx, completeSession(session), revision));

  // Voice and avatar: the only source of turns and evidence is the server's own transcript from ElevenLabs.
  const heard = await readTranscript(ctx, session);
  let completed: Session;
  try {
    completed = await save(ctx, completeSession({ ...session, ...heard }), revision);
  } catch (error) {
    // A parallel finish may already have saved the same transcript.
    const again = await load(ctx, id);
    if (again.session.status !== 'completed') throw error;
    completed = again.session;
  }
  await cleanupConversation(ctx, completed);
  return buildReview(completed);
}

/** Access for the browser SDK to this session's private conversation. Owner-only via RLS in load(). */
export async function startConversation(ctx: Context, id: string): Promise<ConversationAccess> {
  return openConversation(ctx, (await load(ctx, id)).session);
}

export async function getReview(ctx: Context, id: string): Promise<Review> {
  // Ownership is enforced by RLS in load().
  const session = await getSession(ctx, id);
  return { ...buildReview(session), cleanupPending: await loadCleanupPending(ctx, session) };
}
