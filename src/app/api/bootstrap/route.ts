import { loadBootstrap } from '@/server/bootstrap';
import { route } from '@/server/http';

export async function GET(request: Request) {
  return route(request, loadBootstrap);
}
