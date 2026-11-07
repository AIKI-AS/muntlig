import type { AvatarCredentials } from '@/features/media/types';
import { AppError } from '@/server/errors';
import { jsonError, takeQuota } from '@/server/context';
import { readJson } from '@/server/media/body';
import { requireAvatarStart, requireAvatarStop } from '@/server/media/config';
import { authenticate, openActiveSession } from '@/server/media/access';
import { createAvatarToken, isAvatarSessionId, signHandle, stopAvatarSession, verifyHandle } from '@/server/media/liveavatar';
import { getSession } from '@/server/practice';

export const runtime = 'nodejs';

/**
 * POST {action:'start', sessionId} -> AvatarCredentials (LITE session token only, never the API key).
 * POST {action:'stop', sessionId, avatarSessionId, handle} -> {stopped:true}.
 * Starting needs an active avatar-mode session, provider switch, config and quota on every call.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await authenticate(request);
    const body = await readJson(request);
    if (body.action === 'start') {
      const session = await openActiveSession(ctx, body.sessionId, ['avatar']);
      const config = requireAvatarStart();
      await takeQuota(ctx, `media.avatar:${ctx.actor.id}`, 6, 3600);
      const { avatarSessionId, sessionToken } = await createAvatarToken(config);
      const credentials: AvatarCredentials = {
        sessionToken,
        avatarSessionId,
        handle: signHandle(config, ctx.actor.id, session.id, avatarSessionId),
      };
      return Response.json(credentials);
    }
    if (body.action === 'stop') {
      // Stopping must work after the practice session has ended, so only ownership is checked here.
      const session = await getSession(ctx, typeof body.sessionId === 'string' ? body.sessionId : '');
      const config = requireAvatarStop();
      if (!isAvatarSessionId(body.avatarSessionId) || !verifyHandle(config, ctx.actor.id, session.id, body.avatarSessionId, body.handle)) {
        throw new AppError(403, 'Avataren tilhører ikke denne økten.');
      }
      await stopAvatarSession(config, body.avatarSessionId);
      return Response.json({ stopped: true });
    }
    throw new AppError(400, 'Ugyldig forespørsel.');
  } catch (error) {
    return jsonError(error);
  }
}
