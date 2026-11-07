import type { Bootstrap } from '@/lib/contracts';
import { getContext } from './context';
import { integrations } from './env';
import { listPacks } from './packs';
import { listSessions } from './practice';

export async function loadBootstrap(): Promise<Bootstrap> {
  const ctx = await getContext();
  const [packs, sessions] = await Promise.all([listPacks(ctx), listSessions(ctx)]);
  return { actor: ctx.actor, packs, sessions, integrations: integrations() };
}
