import { getContext } from '@/server/context';
import { route } from '@/server/http';
import { startConversation } from '@/server/practice';

export const runtime = 'nodejs';

// No request body on purpose: the client cannot supply a prompt, agent, conversation or any provider id.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(request, async () => startConversation(await getContext(), (await params).id));
}
