import type { PracticeMode, Session } from '@/lib/contracts';
import { checkOrigin, getContext, type Context } from '@/server/context';
import { AppError } from '@/server/errors';
import { getSession } from '@/server/practice';

/** Same-origin check, then verified identity. Runs before any request body is read. */
export async function authenticate(request: Request): Promise<Context> {
  checkOrigin(request);
  return getContext();
}

/**
 * Loads the session through RLS (owner and tenant) and checks it is still active in a mode that allows
 * this media. Call on every paid request: access is never remembered between requests.
 */
export async function openActiveSession(ctx: Context, sessionId: unknown, modes: PracticeMode[]): Promise<Session> {
  const session = await getSession(ctx, typeof sessionId === 'string' ? sessionId : '');
  if (session.status !== 'active') throw new AppError(409, 'Økten er avsluttet.');
  if (!modes.includes(session.mode)) throw new AppError(403, 'Lyd er ikke slått på for denne økten.');
  return session;
}
