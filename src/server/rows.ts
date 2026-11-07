// Database row <-> contract mapping. Columns are listed explicitly so new columns never leak by accident.
// Row shapes are guaranteed by the table CHECK constraints and triggers in supabase/migrations.
import type { Pack, Session } from '../lib/contracts';

export const PACK_COLUMNS = 'id, title, subject, level, description, minutes, goals, sources, rights, status, version, created_at, published_at';
export const SESSION_COLUMNS = 'id, pack_id, pack_version, pack, mode, status, turns, evidence, active_goal_id, revision, started_at, ended_at';

type PackRow = Omit<Pack, 'createdAt' | 'publishedAt'> & { created_at: string; published_at: string | null };
type SessionRow = Omit<Session, 'packId' | 'packVersion' | 'activeGoalId' | 'startedAt' | 'endedAt'> & {
  pack_id: string; pack_version: number; active_goal_id: string; started_at: string; ended_at: string | null; revision: number;
};

export const toPack = ({ created_at, published_at, ...rest }: PackRow): Pack => ({ ...rest, createdAt: created_at, publishedAt: published_at });

export const toSession = (row: SessionRow): { session: Session; revision: number } => ({
  revision: row.revision,
  session: {
    id: row.id,
    packId: row.pack_id,
    packVersion: row.pack_version,
    pack: row.pack,
    mode: row.mode,
    status: row.status,
    turns: row.turns,
    evidence: row.evidence,
    activeGoalId: row.active_goal_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  },
});
