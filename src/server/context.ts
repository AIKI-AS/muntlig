// Request context: Supabase client bound to the caller's verified identity (no service-role key,
// so row level security is the tenant boundary), CSRF origin check, error mapping and quotas.
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import type { Actor, Role } from '../lib/contracts';
import { supabaseConfig } from './env';
import { AppError } from './errors';

export type Context = { actor: Actor; db: SupabaseClient };

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** A Supabase client whose session lives in httpOnly cookies. One per request. */
export async function createDb(): Promise<SupabaseClient> {
  const config = supabaseConfig();
  if (!config) throw new AppError(503, 'Databasen er ikke konfigurert i dette miljøet.');
  const jar = await cookies();
  return createServerClient(config.url, config.anonKey, {
    global: { headers: { 'x-muntlig-write-key': config.writeKey } },
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, { ...options, httpOnly: true });
        } catch {
          // Read-only cookie store (server component render); the route handlers can always write.
        }
      },
    },
  });
}

/** Profile row for a verified user id. Role and tenant come from the database, never the client. */
export async function loadActor(db: SupabaseClient, userId: string): Promise<Actor> {
  const { data, error } = await db.from('profiles').select('tenant_id, role, display_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data || (data.role !== 'teacher' && data.role !== 'student')) {
    throw new AppError(403, 'Kontoen er ikke koblet til en skole. Kontakt administrator.');
  }
  return { id: userId, tenantId: data.tenant_id as string, role: data.role as Role, displayName: data.display_name as string };
}

export async function getContext(): Promise<Context> {
  const db = await createDb();
  // getUser asks the auth server to validate the token; cookies alone are never trusted.
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new AppError(401, 'Du må logge inn.');
  return { actor: await loadActor(db, data.user.id), db };
}

export const requireRole = (ctx: Context, role: Role): void => {
  if (ctx.actor.role !== role) throw new AppError(403, role === 'teacher' ? 'Bare lærere kan gjøre dette.' : 'Bare elever kan gjøre dette.');
};

/** Rejects unsafe requests that do not come from this app's own origin (CSRF). Fails closed without Origin. */
export function checkOrigin(request: Request): void {
  if (SAFE_METHODS.includes(request.method)) return;
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost || originHost !== host) throw new AppError(403, 'Forespørselen ble avvist (ugyldig opprinnelse).');
}

/** Atomic fixed-window counter in the database; throws 429 when the limit is used up. */
export async function takeQuota(ctx: Context, scope: string, limit: number, seconds: number): Promise<void> {
  const { data, error } = await ctx.db.rpc('take_quota', { p_scope: scope, p_limit: limit, p_seconds: seconds });
  if (error) throw error;
  if (data !== true) throw new AppError(429, 'For mange forespørsler. Vent litt og prøv igjen.');
}

const PG_STATUS: Record<string, [number, string]> = {
  '42501': [403, 'Du har ikke tilgang til dette.'],
  '23514': [422, 'Dataene bryter en regel i databasen.'],
  '23505': [409, 'Dette finnes allerede.'],
  '22P02': [400, 'Ugyldig verdi i forespørselen.'],
  PGRST116: [404, 'Fant ikke det du ba om.'],
};

/** Maps any thrown value to a safe `{ error }` response. Never echoes internals, row data or model text. */
export function jsonError(error: unknown): Response {
  let status = 500;
  let message = 'Noe gikk galt. Prøv igjen.';
  if (error instanceof AppError) {
    ({ status, message } = error);
  } else if (error instanceof ZodError) {
    status = 400;
    const fields = [...new Set(error.issues.map((issue) => issue.path.join('.') || 'body'))].slice(0, 5).join(', ');
    message = `Ugyldig forespørsel (${fields}).`;
  } else if (error instanceof SyntaxError) {
    status = 400;
    message = 'Forespørselen er ikke gyldig JSON.';
  } else {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (Object.hasOwn(PG_STATUS, code)) [status, message] = PG_STATUS[code];
    // Name and code only: messages can carry row data or provider output.
    console.error('[api] unexpected error', { name: error instanceof Error ? error.name : typeof error, code });
  }
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
