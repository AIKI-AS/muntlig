import { getContext, requireRole, takeQuota } from '@/server/context';
import { extractSources } from '@/server/documents';
import { AppError } from '@/server/errors';
import { readCapped, route } from '@/server/http';
import { LIMITS } from '@/lib/limits';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return route(request, async () => {
    const ctx = await getContext();
    requireRole(ctx, 'teacher');
    const type = request.headers.get('content-type') ?? '';
    if (!type.startsWith('multipart/form-data')) throw new AppError(415, 'Last opp filen som skjema (multipart).');
    await takeQuota(ctx, 'document', 20, 3600);
    const body = await readCapped(request, LIMITS.fileBytes + 64 * 1024);
    const file = (await new Response(body, { headers: { 'content-type': type } }).formData()).get('file');
    if (!(file instanceof File)) throw new AppError(400, 'Mangler fil.');
    return { sources: await extractSources(file) };
  });
}
