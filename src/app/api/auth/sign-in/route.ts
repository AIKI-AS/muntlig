import { createDb, loadActor } from '@/server/context';
import { AppError } from '@/server/errors';
import { readJson, route } from '@/server/http';
import { signInSchema } from '@/server/schemas';

// E-mail + password only. There is no sign-up route and Supabase sign-ups are disabled in config.toml.
export async function POST(request: Request) {
  return route(request, async () => {
    const { email, password } = await readJson(request, signInSchema);
    const db = await createDb();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error?.status === 429) throw new AppError(429, 'For mange innloggingsforsøk. Vent litt og prøv igjen.');
    if (error || !data.user) throw new AppError(401, 'Feil e-post eller passord.');
    try {
      return await loadActor(db, data.user.id);
    } catch (failure) {
      await db.auth.signOut({ scope: 'local' }); // no profile, no session
      throw failure;
    }
  });
}
