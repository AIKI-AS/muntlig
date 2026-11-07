import { getContext } from '@/server/context';
import { readJson, route } from '@/server/http';
import { createSession, pageSessions } from '@/server/practice';
import { createSessionSchema } from '@/server/schemas';

export async function GET(request: Request) {
  return route(request, async () => {
    const ctx = await getContext();
    const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
    return pageSessions(ctx, cursor);
  });
}

export async function POST(request: Request) {
  return route(request, async () => {
    const ctx = await getContext();
    const { packId, mode, plan } = await readJson(request, createSessionSchema);
    return createSession(ctx, packId, mode, plan);
  });
}
