import { getContext } from '@/server/context';
import { route } from '@/server/http';
import { getSession } from '@/server/practice';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(request, async () => getSession(await getContext(), (await params).id));
}
