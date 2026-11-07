// Fagpakker: teachers write drafts, publishing freezes them. RLS keeps everything inside the tenant.
import type { Pack, PackInput } from '../lib/contracts';
import { requireRole, takeQuota, type Context } from './context';
import { publishPack } from './domain';
import { AppError } from './errors';
import { PACK_COLUMNS, toPack } from './rows';
import { uuidSchema } from './schemas';

export async function listPacks(ctx: Context): Promise<Pack[]> {
  const { data, error } = await ctx.db.from('packs').select(PACK_COLUMNS).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data.map(toPack);
}

export async function createDraft(ctx: Context, input: PackInput): Promise<Pack> {
  requireRole(ctx, 'teacher');
  await takeQuota(ctx, 'pack-create', 30, 3600);
  const { data, error } = await ctx.db
    .from('packs')
    .insert({ ...input, tenant_id: ctx.actor.tenantId, created_by: ctx.actor.id, status: 'draft', version: 1 })
    .select(PACK_COLUMNS)
    .single();
  if (error) throw error;
  return toPack(data);
}

export async function publish(ctx: Context, id: string): Promise<Pack> {
  requireRole(ctx, 'teacher');
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new AppError(404, 'Fant ikke fagpakken.');
  const found = await ctx.db.from('packs').select(PACK_COLUMNS).eq('id', id).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) throw new AppError(404, 'Fant ikke fagpakken.');
  const published = publishPack(toPack(found.data)); // throws on unknown rights, goal count, bad source references
  // Only status and timestamp change; the trigger refuses any other change and any later update.
  const { data, error } = await ctx.db
    .from('packs')
    .update({ status: 'published', published_at: published.publishedAt })
    .eq('id', id)
    .eq('status', 'draft')
    .select(PACK_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError(409, 'Fagpakken er allerede publisert.');
  return toPack(data);
}
