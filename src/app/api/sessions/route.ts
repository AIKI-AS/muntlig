import { getContext } from '@/server/context';
import { readJson, route } from '@/server/http';
import { createSession } from '@/server/practice';
import { createSessionSchema } from '@/server/schemas';

export async function POST(request: Request) {
  return route(request, async () => {
    const ctx = await getContext();
    const { packId, mode } = await readJson(request, createSessionSchema);
    return createSession(ctx, packId, mode);
  });
}
