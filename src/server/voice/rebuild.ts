// Pure rebuild of a voice session from the provider's own transcript. Nothing here trusts the browser, and the
// agent's tool calls are only claims: a goal change must stay within the student's selection, and evidence exists
// only if its quote is literally inside something the student said on that goal. Support can only lower a claim.
import type { Evidence, Session, Turn } from '@/lib/contracts';
import { normalizeSpeech, parseRecordEvidence, parseShowGoal, RECORD_EVIDENCE_TOOL, SHOW_GOAL_TOOL } from '@/lib/conversation';
import { LIMITS } from '@/lib/limits';
import { practiceGoals } from '@/lib/practice-plan';

export type ProviderToolCall = { name: string; params: unknown };

/** One transcript entry as ElevenLabs reports it, reduced to the fields the rebuild uses. */
export type ProviderEntry = {
  role: 'user' | 'agent';
  message: string | null;
  timeInCallSecs: number;
  interrupted: boolean;
  ignoredAsBackchannel: boolean;
  platformEvent: boolean;
  sourceMedium: string | null;
  toolCalls: ProviderToolCall[];
};

export type Rebuilt = Pick<Session, 'turns' | 'evidence' | 'activeGoalId'>;

// Speech and typed chat count as the student's words (an unknown medium is treated as speech). Files, images and
// keypad input never do, and neither does anything that was interrupted.
const STUDENT_MEDIA: Record<string, true> = { audio: true, text: true };
const isStudentWords = (entry: ProviderEntry): boolean =>
  !entry.interrupted && (entry.sourceMedium === null || Object.hasOwn(STUDENT_MEDIA, entry.sourceMedium));

/**
 * `startedAtMs` is the provider's conversation start; it only dates the turns.
 * The first agent line is deterministic server text for goal 1, so the conversation starts on goal 1.
 */
export function rebuildFromTranscript(session: Session, entries: ProviderEntry[], startedAtMs: number): Rebuilt {
  const goals = practiceGoals(session);
  const planned = { goals };
  let active = 0;
  const turns: Turn[] = [];
  const evidence: Evidence[] = [];
  const studentSpoke = new Set<string>();
  const studentTurns = new Map<string, number[]>();

  for (const entry of entries) {
    if (entry.platformEvent || entry.ignoredAsBackchannel) continue;

    // Goal changes first: the agent may follow an interest or revisit any selected goal.
    if (entry.role === 'agent') {
      for (const call of entry.toolCalls) {
        if (call.name !== SHOW_GOAL_TOOL) continue;
        const shown = parseShowGoal(call.params, planned);
        if (shown) active = goals.findIndex((goal) => goal.id === shown.goalId);
      }
    }

    const goalId = goals[active].id;
    const text = normalizeSpeech(entry.message ?? '').slice(0, LIMITS.turnText);
    if (text) {
      const at = new Date(startedAtMs + entry.timeInCallSecs * 1000).toISOString();
      if (entry.role === 'user') {
        turns.push({ id: crypto.randomUUID(), role: 'user', text, sourceIds: [], goalId, at, hint: false });
        studentSpoke.add(goalId);
        if (isStudentWords(entry)) studentTurns.set(goalId, [...(studentTurns.get(goalId) ?? []), turns.length - 1]);
      } else {
        // Anything the agent says after the student has answered on this goal is follow-up support.
        const hint = studentSpoke.has(goalId);
        const last = turns.at(-1);
        if (last && last.role === 'assistant' && last.goalId === goalId && last.text.length + 1 + text.length <= LIMITS.turnText) {
          last.text = `${last.text} ${text}`;
          last.hint = last.hint || hint;
        } else {
          turns.push({ id: crypto.randomUUID(), role: 'assistant', text, sourceIds: [], goalId, at, hint });
        }
      }
    }

    if (entry.role !== 'agent') continue;
    for (const call of entry.toolCalls) {
      if (call.name !== RECORD_EVIDENCE_TOOL) continue;
      const claim = parseRecordEvidence(call.params, planned);
      if (!claim) continue;
      if (evidence.some((item) => item.goalId === claim.goalId)) continue;
      const found = (studentTurns.get(claim.goalId) ?? []).find((index) => turns[index].text.includes(claim.quote));
      if (found === undefined) continue;
      // Teacher-supplied words are support even if the goal changed after the explanation.
      const quote = claim.quote.toLowerCase();
      const helped = turns.slice(0, found).some((turn) => turn.role === 'assistant'
        && ((turn.goalId === claim.goalId && turn.hint) || turn.text.toLowerCase().includes(quote)));
      evidence.push({
        goalId: claim.goalId,
        status: claim.status === 'independent' && !helped ? 'independent' : 'with_hint',
        quote: claim.quote,
        turnId: turns[found].id,
        sourceIds: claim.sourceIds,
      });
    }
  }

  // The database caps a session at LIMITS.turns; keep every evidence turn and drop the oldest others.
  const keep = new Set(evidence.map((item) => item.turnId));
  let excess = turns.length - LIMITS.turns;
  const kept = excess > 0 ? turns.filter((turn) => keep.has(turn.id) || excess-- <= 0) : turns;
  return { turns: kept, evidence, activeGoalId: goals[active].id };
}
