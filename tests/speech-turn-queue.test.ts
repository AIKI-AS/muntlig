import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechTurnQueue } from '../src/features/media/speech-turn-queue';
import type { Turn } from '../src/lib/contracts';

const turn = (id: string, text: string): Turn => ({
  id, text, role: 'assistant', sourceIds: [], goalId: 'goal-0',
  at: '2026-11-07T12:00:00.000Z', hint: false,
});

test('one avatar utterance reveals every pending response without shifting the next answer', () => {
  const queue = new SpeechTurnQueue();
  assert.deepEqual(queue.receive(turn('agent:1', 'Domstolene er uavhengige.')), []);
  assert.deepEqual(queue.receive(turn('agent:2', 'Hva hindrer politisk press?')), []);
  assert.deepEqual(queue.speechStarted('utterance-1').map(({ text }) => text), [
    'Domstolene er uavhengige.', 'Hva hindrer politisk press?',
  ]);
  assert.deepEqual(queue.receive(turn('agent:3', 'Stortinget vedtar lovene.')), []);
  assert.deepEqual(queue.speechStarted('utterance-1'), [], 'duplicate starts must not reveal a later response');
  assert.deepEqual(queue.speechStarted('utterance-2').map(({ text }) => text), ['Stortinget vedtar lovene.']);
  assert.deepEqual(queue.flush(), []);
});

test('early speech, corrections and interruption keep text without carrying stale answers into later speech', () => {
  const queue = new SpeechTurnQueue();
  assert.deepEqual(queue.speechStarted('utterance-1'), []);
  assert.deepEqual(queue.receive(turn('agent:1', 'Et konkret eksempel.')).map(({ text }) => text), ['Et konkret eksempel.']);
  queue.receive(turn('agent:2', 'Avbrutt svar.'));
  queue.correct('agent:2', 'Korrigert svar.');
  assert.deepEqual(queue.flush().map(({ text }) => text), ['Korrigert svar.']);
  queue.receive(turn('agent:3', 'En sen fortsettelse.'));
  queue.receive(turn('agent:4', 'Det nye svaret.'));
  assert.equal(queue.speechStarted('utterance-2').at(-1)?.text, 'Det nye svaret.');
  assert.deepEqual(queue.flush(), []);
});
