import { createDb } from '@/server/context';
import { route } from '@/server/http';

export async function POST(request: Request) {
  return route(request, async () => {
    await (await createDb()).auth.signOut({ scope: 'local' });
    return { ok: true };
  });
}
