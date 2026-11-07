import { getContext } from '@/server/context';
import { route } from '@/server/http';
import { getReview } from '@/server/practice';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(request, async () => getReview(await getContext(), (await params).id));
}
