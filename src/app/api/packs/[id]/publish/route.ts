import { getContext } from '@/server/context';
import { route } from '@/server/http';
import { publish } from '@/server/packs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(request, async () => publish(await getContext(), (await params).id));
}
