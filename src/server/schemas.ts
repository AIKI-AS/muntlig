// Request validation. Zod rejects malformed input at the edge; domain.ts re-checks the publish invariants.
import { z } from 'zod';
import { ID_PATTERN, LIMITS } from '../lib/limits';

const id = z.string().regex(ID_PATTERN, 'ugyldig id');
const text = (max: number) => z.string().trim().min(1).max(max);

export const sourceSchema = z.object({
  id,
  title: text(LIMITS.sourceTitle),
  page: z.number().int().min(1).max(10000),
  text: text(LIMITS.sourceText),
});

export const goalSchema = z.object({
  id,
  title: text(LIMITS.goalTitle),
  prompt: text(LIMITS.goalPrompt),
  sourceIds: z.array(id).max(LIMITS.sources),
});

const sources = z.array(sourceSchema).max(LIMITS.sources)
  .refine((list) => list.reduce((sum, item) => sum + item.text.length, 0) <= LIMITS.sourcesTotalChars, 'kildene er for lange');

export const signInSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

export const packInputSchema = z.object({
  title: text(LIMITS.title),
  subject: text(LIMITS.subject),
  level: text(LIMITS.level),
  description: z.string().trim().max(LIMITS.description),
  minutes: z.number().int().min(LIMITS.minutesMin).max(LIMITS.minutesMax),
  goals: z.array(goalSchema).length(LIMITS.goals),
  sources,
  rights: z.enum(['teacher_owned', 'open_license', 'publisher_licensed', 'unknown']),
});

export const suggestSchema = z.object({
  title: text(LIMITS.title),
  subject: text(LIMITS.subject),
  level: text(LIMITS.level),
  sources: sources.min(1),
});

export const createSessionSchema = z.object({
  packId: z.uuid(),
  mode: z.enum(['text', 'voice', 'avatar']),
  plan: z.object({
    goalIds: z.array(id).min(1).max(LIMITS.goals),
    focus: z.enum(['understand', 'explain', 'examples', 'discussion']),
    request: z.string().max(LIMITS.practiceRequest).trim(),
  }).strict().optional(),
});

export const sessionCursorSchema = z.object({ startedAt: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();

export const turnSchema = z.object({
  text: text(LIMITS.answer),
  expectedTurnCount: z.number().int().min(0).max(LIMITS.turns),
});

export const uuidSchema = z.uuid();
