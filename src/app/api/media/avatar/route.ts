import type { AvatarCredentials } from '@/features/media/types';
import { AppError } from '@/server/errors';
import { jsonError, takeQuota } from '@/server/context';
import { readJson } from '@/server/media/body';
import { requireAvatarStart } from '@/server/media/config';
import { authenticate, openActiveSession } from '@/server/media/access';
import { createAvatarToken } from '@/server/media/simli';

export const runtime = 'nodejs';

/**
 * POST {action:'start', sessionId} -> AvatarCredentials (Simli session token only, never the API key).
 * Needs an active avatar-mode session owned by the caller, provider switch, config and quota on every call.
 * There is no stop action: the browser SDK ends its own session with the session token.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await authenticate(request);
    const body = await readJson(request);
    if (body.action !== 'start') throw new AppError(400, 'Ugyldig forespørsel.');
    await openActiveSession(ctx, body.sessionId, ['avatar']);
    const config = requireAvatarStart();
    await takeQuota(ctx, `media.avatar:${ctx.actor.id}`, 6, 3600);
    const credentials: AvatarCredentials = await createAvatarToken(config);
    return Response.json(credentials, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}
