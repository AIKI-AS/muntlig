import { getContext } from '@/server/context';
import { readJson, route } from '@/server/http';
import { takeTurn } from '@/server/practice';
import { turnSchema } from '@/server/schemas';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(request, async () => {
    const ctx = await getContext();
    const { text, expectedTurnCount } = await readJson(request, turnSchema);
    return takeTurn(ctx, (await params).id, text, expectedTurnCount);
  });
}
