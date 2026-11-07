// The only place that talks to the LLM provider. Output is untrusted: the caller must still pass it
// through domain.ts. A failed call throws before anything is stored; there is no canned fallback.
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { AutoParseableResponseFormat } from 'openai/lib/parser';
import { z } from 'zod';
import type { Goal, Session, Source } from '../lib/contracts';
import type { Proposal, Question } from './domain';
import { openaiConfig } from './env';
import { AppError } from './errors';
import { LIMITS } from '../lib/limits';
import { QUESTION_SYSTEM, REPLY_SYSTEM, SUGGEST_SYSTEM, questionInput, replyInput, suggestInput } from './prompts';
import { goalSchema } from './schemas';

// Plain types only: strict structured outputs reject most length/format keywords. Bounds are checked after parsing.
const questionFormat = zodResponseFormat(z.object({ reply: z.string(), sourceIds: z.array(z.string()) }), 'muntlig_question');
const replyFormat = zodResponseFormat(z.object({
  reply: z.string(),
  sourceIds: z.array(z.string()),
  hint: z.boolean(),
  evidence: z.nullable(z.object({
    status: z.enum(['independent', 'with_hint']),
    quote: z.string(),
    sourceIds: z.array(z.string()),
  })),
}), 'muntlig_reply');
const suggestFormat = zodResponseFormat(z.object({
  description: z.string(),
  goals: z.array(z.object({ title: z.string(), prompt: z.string(), sourceIds: z.array(z.string()) })),
}), 'muntlig_goals');

const unavailable = () => new AppError(502, 'KI-tjenesten svarte ikke riktig. Prøv igjen om litt.');

async function complete<T>(format: AutoParseableResponseFormat<T>, system: string, payload: unknown): Promise<T> {
  const config = openaiConfig();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 1, timeout: 30_000 });
  try {
    const result = await client.chat.completions.parse({
      model: config.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
      response_format: format,
      max_completion_tokens: LIMITS.completionTokens,
      store: false,
    });
    const parsed = result.choices[0]?.message.parsed;
    if (!parsed) throw unavailable();
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Status and class only; never the request, the response or the key.
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    console.error('[llm] provider call failed', { name: error instanceof Error ? error.name : typeof error, status });
    if (status === 429) throw new AppError(503, 'KI-tjenesten er overbelastet. Prøv igjen om litt.');
    throw unavailable();
  }
}

export async function askQuestion(session: Session): Promise<Question> {
  return complete(questionFormat, QUESTION_SYSTEM, questionInput(session));
}

export async function askReply(session: Session, answer: string): Promise<Proposal> {
  const output = await complete(replyFormat, REPLY_SYSTEM, replyInput(session, answer));
  // The goal is decided by the server, not echoed by the model.
  return { ...output, goalId: session.activeGoalId };
}

export async function suggestGoals(input: { title: string; subject: string; level: string; sources: Source[] }): Promise<{ goals: Goal[]; description: string }> {
  const output = await complete(suggestFormat, SUGGEST_SYSTEM, suggestInput(input));
  const known = new Set(input.sources.map((source) => source.id));
  const goals = output.goals.map((goal) => ({
    id: `goal-${crypto.randomUUID().slice(0, 8)}`,
    title: goal.title.trim(),
    prompt: goal.prompt.trim(),
    sourceIds: [...new Set(goal.sourceIds.filter((id) => known.has(id)))],
  }));
  const checked = z.array(goalSchema.extend({ sourceIds: z.array(z.string()).min(1) })).length(LIMITS.goals).safeParse(goals);
  if (!checked.success) throw unavailable();
  return { goals: checked.data, description: output.description.trim().slice(0, 300) };
}
