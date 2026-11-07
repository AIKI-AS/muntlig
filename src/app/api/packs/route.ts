import { getContext } from '@/server/context';
import { readJson, route } from '@/server/http';
import { LIMITS } from '@/lib/limits';
import { createDraft } from '@/server/packs';
import { packInputSchema } from '@/server/schemas';

export async function POST(request: Request) {
  return route(request, async () => {
    const ctx = await getContext();
    return createDraft(ctx, await readJson(request, packInputSchema, LIMITS.packBodyBytes));
  });
}
