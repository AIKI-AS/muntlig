import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pack } from '../src/lib/contracts';
import { applyReply, buildReview, nextGoal, publishPack, startSession } from '../src/server/domain';
import { rebuildFromTranscript } from '../src/server/voice/rebuild';

const pack: Pack = {
  id: 'pack-plan', title: 'Maktfordeling', subject: 'Samfunnskunnskap', level: 'VG1', description: '', minutes: 5,
  rights: 'teacher_owned', status: 'draft', version: 1, createdAt: '2026-11-07T10:00:00Z', publishedAt: null,
  sources: [{ id: 'source-a', title: 'Lærerens notater', page: 1, text: 'Stortinget vedtar lover. Regjeringen gjennomfører vedtak. Domstolene dømmer.' }],
  goals: ['Forklare maktfordeling', 'Bruke et eksempel', 'Drøfte maktbalanse'].map((title, index) => ({ id: `goal-${index}`, title, prompt: title, sourceIds: ['source-a'] })),
};

const published = () => publishPack(pack);

test('elevens målvalg styrer første mål, rekkefølge og gjennomgang uten å endre fagpakken', () => {
  const plan = { goalIds: ['goal-2', 'goal-1'], focus: 'examples' as const, request: 'Jeg vil bruke eksempler fra skolen.' };
  const session = startSession(published(), 'voice', plan);
  assert.equal(session.activeGoalId, 'goal-1');
  assert.deepEqual(session.plan.goalIds, ['goal-1', 'goal-2']);
  assert.deepEqual(session.pack.goals.map(goal => goal.id), ['goal-0', 'goal-1', 'goal-2']);
  assert.equal(session.plan.focus, 'examples');
  plan.goalIds.length = 0;
  plan.request = 'Endret etter oppstart';
  assert.equal(session.plan.request, 'Jeg vil bruke eksempler fra skolen.');
  const moved = nextGoal(session);
  assert.equal(moved.activeGoalId, 'goal-2');
  assert.throws(() => nextGoal(moved));
  assert.deepEqual(buildReview(session).goals.map(goal => goal.id), ['goal-1', 'goal-2']);
});

test('tomme, dupliserte og fremmede mål eller et for langt øvingsønske avvises før økten starter', () => {
  for (const goalIds of [[], ['goal-1', 'goal-1'], ['foreign-goal'], ['goal-0', 'goal-1', 'goal-2', 'goal-3']]) {
    assert.throws(() => startSession(published(), 'avatar', { goalIds, focus: 'explain', request: '' }));
  }
  assert.throws(() => startSession(published(), 'voice', { goalIds: ['goal-0'], focus: 'understand', request: 'x'.repeat(601) }));
});

test('transkriptet kan ikke gjeninnføre et mål som eleven ikke valgte', () => {
  const session = startSession(published(), 'voice', { goalIds: ['goal-1'], focus: 'explain', request: '' });
  const rebuilt = rebuildFromTranscript(session, [{
    role: 'agent', message: 'Vi prøver et annet mål.', timeInCallSecs: 0, interrupted: false,
    ignoredAsBackchannel: false, platformEvent: false, sourceMedium: 'audio',
    toolCalls: [{ name: 'show_goal', params: { goalId: 'goal-0' } }],
  }], Date.parse('2026-11-07T10:00:00Z'));
  assert.equal(rebuilt.activeGoalId, 'goal-1');
  assert.equal(rebuilt.turns[0].goalId, 'goal-1');
  const answered = applyReply(session, 'Stortinget vedtar lover.', {
    reply: 'Kan du knytte det til eksemplet ditt?', sourceIds: ['source-a'], goalId: 'goal-1', hint: false,
    evidence: { status: 'independent', quote: 'Stortinget vedtar lover.', sourceIds: ['source-a'] },
  });
  const review = buildReview(answered);
  assert.equal(review.explored, 1);
  assert.deepEqual(review.goals.map(goal => [goal.id, goal.evidence?.quote]), [['goal-1', 'Stortinget vedtar lover.']]);
});
