import type { Goal, Source } from '../lib/contracts';
import { LIMITS } from '../lib/limits';

const terms = (text: string): Set<string> => new Set(text.toLocaleLowerCase('nb').match(/\p{L}{4,}/gu) ?? []);

/**
 * Picks the goal's own sources (never the rest of the pack) that overlap most with the query,
 * within a character budget. Returned in pack order so page references stay readable.
 * ponytail: keyword overlap, no embeddings. Upgrade if packs outgrow a few dozen short sources.
 */
export function retrieveSources(goal: Goal, sources: Source[], query: string, budget: number = LIMITS.promptSourceChars): Source[] {
  const wanted = terms(`${goal.title} ${goal.prompt} ${query}`);
  const ranked = sources
    .map((source, index) => ({ source, index, score: [...terms(`${source.title} ${source.text}`)].filter((term) => wanted.has(term)).length }))
    .filter((item) => goal.sourceIds.includes(item.source.id))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen: typeof ranked = [];
  let used = 0;
  for (const item of ranked) {
    if (used + item.source.text.length > budget) continue;
    chosen.push(item);
    used += item.source.text.length;
  }
  return chosen.sort((a, b) => a.index - b.index).map((item) => item.source);
}
