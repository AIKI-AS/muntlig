import { MuntligApp } from '@/features/workspace/muntlig-app';
import type { Bootstrap } from '@/lib/contracts';
import { loadBootstrap } from '@/server/bootstrap';
import { AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';
export default async function Page() {
  let initialData: Bootstrap | null = null;
  let initialError: string | null = null;
  try {
    initialData = await loadBootstrap();
  } catch (error) {
    initialError = error instanceof AppError
      ? error.status === 401 ? null : error.message
      : 'Vi fikk ikke kontakt med skolen. Prøv igjen.';
  }
  return <MuntligApp initialData={initialData} initialError={initialError} />;
}
