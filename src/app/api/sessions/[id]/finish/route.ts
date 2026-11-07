import { getContext } from '@/server/context';
import { route } from '@/server/http';
import { finishSession } from '@/server/practice';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(request, async () => finishSession(await getContext(), (await params).id));
}
