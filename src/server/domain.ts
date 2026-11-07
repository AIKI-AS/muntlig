// Pure session rules. No I/O, no framework imports: the model is untrusted input and every
// transition that persists something about the student is decided here.
import type { Evidence, Goal, Pack, PracticeMode, Review, Session, Turn } from '../lib/contracts';
import { fail } from './errors';
import { ID_PATTERN, LIMITS } from '../lib/limits';

export type Proposal = {
  reply: string;
  sourceIds: string[];
  goalId: string;
  hint: boolean;
  evidence: null | { status: 'independent' | 'with_hint'; quote: string; sourceIds: string[] };
};
export type Question = Pick<Proposal, 'reply' | 'sourceIds'>;

const KNOWN_RIGHTS = ['teacher_owned', 'open_license', 'publisher_licensed'];
const MODES = ['text', 'voice', 'avatar'];
const clone = <T>(value: T): T => structuredClone(value);

const bounded = (value: unknown, max: number, label: string): void => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} må ha 1–${max} tegn.`);
};

function checkContent(pack: Pack): void {
  bounded(pack.title, LIMITS.title, 'Tittel');
  bounded(pack.subject, LIMITS.subject, 'Fag');
  bounded(pack.level, LIMITS.level, 'Trinn');
  if (typeof pack.description !== 'string' || pack.description.length > LIMITS.description) fail('Beskrivelsen er for lang.');
  if (!Number.isInteger(pack.minutes) || pack.minutes < LIMITS.minutesMin || pack.minutes > LIMITS.minutesMax) {
    fail(`Varighet må være ${LIMITS.minutesMin}–${LIMITS.minutesMax} minutter.`);
  }
  if (!Array.isArray(pack.goals) || pack.goals.length !== LIMITS.goals) fail('En fagpakke må ha nøyaktig tre læringsmål.');
  if (!Array.isArray(pack.sources) || pack.sources.length < 1 || pack.sources.length > LIMITS.sources) {
    fail(`En fagpakke må ha 1–${LIMITS.sources} kilder.`);
  }
  const sourceIds = new Set<string>();
  let total = 0;
  for (const source of pack.sources) {
    if (typeof source.id !== 'string' || !ID_PATTERN.test(source.id) || sourceIds.has(source.id)) fail('Kilde-ID er ugyldig eller duplisert.');
    sourceIds.add(source.id);
    bounded(source.title, LIMITS.sourceTitle, 'Kildetittel');
    bounded(source.text, LIMITS.sourceText, 'Kildetekst');
    if (!Number.isInteger(source.page) || source.page < 1 || source.page > 10000) fail('Sidetall for kilden er ugyldig.');
    total += source.text.length;
  }
  if (total > LIMITS.sourcesTotalChars) fail('Kildene er samlet for lange.');
  const goalIds = new Set<string>();
  for (const goal of pack.goals) {
    if (typeof goal.id !== 'string' || !ID_PATTERN.test(goal.id) || goalIds.has(goal.id)) fail('Mål-ID er ugyldig eller duplisert.');
    goalIds.add(goal.id);
    bounded(goal.title, LIMITS.goalTitle, 'Måltittel');
    bounded(goal.prompt, LIMITS.goalPrompt, 'Målbeskrivelse');
    const refs = goal.sourceIds;
    if (!Array.isArray(refs) || !refs.length || new Set(refs).size !== refs.length || refs.some((id) => !sourceIds.has(id))) {
      fail('Hvert læringsmål må vise til kilder i fagpakken.');
    }
  }
}

export function publishPack(pack: Pack): Pack {
  if (pack.status !== 'draft') fail('Fagpakken er allerede publisert.', 409);
  if (!KNOWN_RIGHTS.includes(pack.rights)) fail('Rettighetene til kildene må avklares før publisering.');
  checkContent(pack);
  return { ...clone(pack), status: 'published', publishedAt: new Date().toISOString() };
}

export function startSession(pack: Pack, mode: PracticeMode): Session {
  if (pack.status !== 'published') fail('Bare publiserte fagpakker kan brukes i en økt.', 409);
  if (!MODES.includes(mode)) fail('Ukjent øktmodus.');
  const snapshot = clone(pack);
  return {
    id: crypto.randomUUID(),
    packId: snapshot.id,
    packVersion: snapshot.version,
    pack: snapshot,
    mode,
    status: 'active',
    turns: [],
    evidence: [],
    activeGoalId: snapshot.goals[0].id,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
}

function activeGoal(session: Session): Goal {
  const goal = session.pack.goals.find((item) => item.id === session.activeGoalId);
  return goal ?? fail('Økten mangler aktivt mål.', 500);
}

const requireActive = (session: Session): void => {
  if (session.status !== 'active') fail('Økten er avsluttet.', 409);
};

const requireRoom = (session: Session): void => {
  if (session.turns.length + 2 > LIMITS.turns) fail('Samtalen er full. Avslutt økten for å se gjennomgangen.', 409);
};

function checkAssistant(goal: Goal, question: Question): string {
  const reply = typeof question.reply === 'string' ? question.reply.trim() : '';
  if (!reply || reply.length > LIMITS.reply) fail('Modellen ga et tomt eller for langt svar.', 502);
  const ids = question.sourceIds;
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !goal.sourceIds.includes(id))) {
    fail('Modellen viste til kilder utenfor målet.', 502);
  }
  return reply;
}

const assistantTurn = (goal: Goal, reply: string, sourceIds: string[], hint: boolean): Turn => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  text: reply,
  sourceIds: [...new Set(sourceIds)],
  goalId: goal.id,
  at: new Date().toISOString(),
  hint,
});

// A hint counts only if it was given before the answer that is being judged.
const hintedBefore = (turns: Turn[], goalId: string, index: number): boolean =>
  turns.slice(0, index).some((turn) => turn.role === 'assistant' && turn.goalId === goalId && turn.hint);

/** First question for the active goal (session start, or after moving to the next goal). */
export function addQuestion(session: Session, question: Question): Session {
  requireActive(session);
  requireRoom(session);
  const goal = activeGoal(session);
  if (session.turns.at(-1)?.goalId === goal.id) fail('Det er allerede stilt et spørsmål for dette målet.', 409);
  const reply = checkAssistant(goal, question);
  const next = clone(session);
  next.turns.push(assistantTurn(goal, reply, question.sourceIds, false));
  return next;
}

/** Record the student's answer and the model's validated reply. Never changes the active goal. */
export function applyReply(session: Session, answer: string, proposal: Proposal): Session {
  requireActive(session);
  requireRoom(session);
  const goal = activeGoal(session);
  const text = typeof answer === 'string' ? answer.trim() : '';
  if (!text || text.length > LIMITS.answer) fail(`Svaret må ha 1–${LIMITS.answer} tegn.`);
  if (proposal.goalId !== goal.id) fail('Modellen refererte til et ukjent eller inaktivt mål.', 502);
  const reply = checkAssistant(goal, proposal);

  let evidence: Evidence | null = null;
  const claim = proposal.evidence;
  if (claim) {
    const quote = typeof claim.quote === 'string' ? claim.quote.trim() : '';
    if (quote.length < LIMITS.quoteMin || quote.length > LIMITS.quote || !text.includes(quote)) {
      fail('Modellens sitat finnes ikke i elevens svar.', 502);
    }
    const refs = claim.sourceIds;
    if (!Array.isArray(refs) || !refs.length || refs.some((id) => !goal.sourceIds.includes(id))) {
      fail('Modellens evidens viser til kilder utenfor målet.', 502);
    }
    if (claim.status !== 'independent' && claim.status !== 'with_hint') fail('Ugyldig evidensstatus fra modellen.', 502);
    const hinted = hintedBefore(session.turns, goal.id, session.turns.length);
    evidence = {
      goalId: goal.id,
      status: hinted ? 'with_hint' : claim.status,
      quote,
      turnId: '',
      sourceIds: [...new Set(refs)],
    };
  }

  const next = clone(session);
  const userTurn: Turn = {
    id: crypto.randomUUID(), role: 'user', text, sourceIds: [], goalId: goal.id, at: new Date().toISOString(), hint: false,
  };
  next.turns.push(userTurn, assistantTurn(goal, reply, proposal.sourceIds, proposal.hint === true));
  // First evidence per goal wins; a later quote never overwrites or upgrades it.
  if (evidence && !next.evidence.some((item) => item.goalId === goal.id)) {
    next.evidence.push({ ...evidence, turnId: userTurn.id });
  }
  return next;
}

/** Deterministic move to the next goal in pack order. Records no evidence. */
export function nextGoal(session: Session): Session {
  requireActive(session);
  const goals = session.pack.goals;
  const index = goals.findIndex((goal) => goal.id === session.activeGoalId);
  if (index < 0 || index === goals.length - 1) fail('Dette er det siste målet. Avslutt økten for å se gjennomgangen.', 409);
  const next = clone(session);
  next.activeGoalId = goals[index + 1].id;
  return next;
}

export function completeSession(session: Session): Session {
  requireActive(session);
  const next = clone(session);
  next.status = 'completed';
  next.endedAt = new Date().toISOString();
  return next;
}

/** Evidence is shown only if it still points at a real student turn that literally contains the quote. */
function verified(session: Session, evidence: Evidence): Evidence | null {
  const index = session.turns.findIndex((turn) => turn.id === evidence.turnId);
  const turn = session.turns[index];
  if (!turn || turn.role !== 'user' || turn.goalId !== evidence.goalId) return null;
  if (!evidence.quote || !turn.text.includes(evidence.quote)) return null;
  if (evidence.status !== 'independent' && evidence.status !== 'with_hint') return null;
  const status = hintedBefore(session.turns, evidence.goalId, index) ? 'with_hint' : evidence.status;
  return { ...clone(evidence), status };
}

export function buildReview(session: Session): Review {
  const goals = session.pack.goals.map((goal) => {
    const found = session.evidence.filter((item) => item.goalId === goal.id).map((item) => verified(session, item)).find(Boolean);
    return { ...clone(goal), evidence: found ?? null };
  });
  const open = goals.find((goal) => goal.evidence === null);
  return {
    session: clone(session),
    goals,
    explored: goals.filter((goal) => goal.evidence !== null).length,
    nextGoal: open ? clone(session.pack.goals.find((goal) => goal.id === open.id) as Goal) : null,
    cleanupPending: false,
  };
}
