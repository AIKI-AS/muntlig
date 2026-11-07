import { getContext, requireRole, takeQuota } from '@/server/context';
import { requireLlm } from '@/server/env';
import { readJson, route } from '@/server/http';
import { LIMITS } from '@/lib/limits';
import { suggestGoals } from '@/server/llm';
import { suggestSchema } from '@/server/schemas';

export async function POST(request: Request) {
  return route(request, async () => {
    const ctx = await getContext();
    requireRole(ctx, 'teacher');
    requireLlm();
    await takeQuota(ctx, 'suggest', 15, 3600);
    return suggestGoals(await readJson(request, suggestSchema, LIMITS.packBodyBytes));
  });
}
