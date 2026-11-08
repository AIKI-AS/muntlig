import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/client-api';
import type { Review } from '../src/lib/contracts';
import {
  BACKOFF_MS, GIVE_UP_MESSAGE, GIVE_UP_MS, POLL_MS, STALE_MS,
  applyOutcome, attemptReview, createEntry, parseStored, planWork, retryDelay,
  type ReviewEntry, type ReviewOutcome,
} from '../src/features/workspace/review-queue';

const T0 = 1_000_000;
const review = (status: 'active' | 'completed') => ({ session: { id: 's1', status } }) as unknown as Review;

/** Plays the worker loop with a fake clock: every request answers 425 until `readyAfter` ms have passed. */
function simulate(outcomeAt: (elapsed: number) => ReviewOutcome) {
  let entry: ReviewEntry | null = createEntry('s1', T0);
  let now = T0;
  const requests: number[] = [];
  while (entry && entry.state === 'waiting') {
    const { due, wakeAt } = planWork([entry], new Set(), now);
    if (due.length === 0) { assert.notEqual(wakeAt, null); now = wakeAt as number; continue; }
    requests.push(now - T0);
    entry = applyOutcome(entry, outcomeAt(now - T0), now);
  }
  return { entry, requests };
}

test('backoff is 2 s, 4 s, 8 s and then every 15 s', () => {
  assert.deepEqual(BACKOFF_MS, [2000, 4000, 8000]);
  assert.deepEqual([1, 2, 3, 4, 5, 20].map(retryDelay), [2000, 4000, 8000, POLL_MS, POLL_MS, POLL_MS]);
});

test('a new entry is due at once and a 425 reschedules it with the next delay', () => {
  const entry = createEntry('s1', T0);
  assert.deepEqual(planWork([entry], new Set(), T0), { due: ['s1'], wakeAt: null });
  const next = applyOutcome(entry, { kind: 'processing' }, T0 + 100);
  assert.deepEqual(next, { sessionId: 's1', state: 'waiting', attempts: 1, nextAt: T0 + 100 + 2000, startedAt: T0, error: undefined });
  assert.deepEqual(planWork([next as ReviewEntry], new Set(), T0 + 100), { due: [], wakeAt: T0 + 2100 });
  assert.deepEqual(planWork([next as ReviewEntry], new Set(), T0 + 2100), { due: ['s1'], wakeAt: null });
});

test('requests follow 0, 2, 6, 14, 29 s ... and one 425 stream gives up after about ten minutes', () => {
  const { entry, requests } = simulate(() => ({ kind: 'processing' }));
  assert.deepEqual(requests.slice(0, 6), [0, 2000, 6000, 14000, 29000, 44000]);
  assert.equal(entry?.state, 'failed');
  assert.equal(entry?.error, GIVE_UP_MESSAGE);
  const last = requests.at(-1) as number;
  assert.ok(last <= GIVE_UP_MS, 'no request after the deadline');
  assert.ok(last + POLL_MS > GIVE_UP_MS, 'the deadline is only reached once the next request would be too late');
  assert.ok(requests.every((at, i) => i === 0 || at - requests[i - 1] <= POLL_MS));
});

test('the review becoming ready ends the loop and removes the entry', () => {
  const { entry, requests } = simulate((elapsed) => elapsed >= 20_000 ? { kind: 'ready', review: review('completed') } : { kind: 'processing' });
  assert.equal(entry, null);
  assert.deepEqual(requests, [0, 2000, 6000, 14000, 29000]);
});

test('any other error fails the entry at once and keeps the message', () => {
  const entry = createEntry('s1', T0);
  const failed = applyOutcome(entry, { kind: 'error', message: 'Noe gikk galt.' }, T0 + 5);
  assert.equal(failed?.state, 'failed');
  assert.equal(failed?.error, 'Noe gikk galt.');
  assert.deepEqual(planWork([failed as ReviewEntry], new Set(), T0 + 10 ** 9), { due: [], wakeAt: null }, 'a failed entry is never requested again until retried');
});

test('retrying a failed entry starts a fresh run with a fresh deadline', () => {
  const failed = applyOutcome(createEntry('s1', T0), { kind: 'error', message: 'x' }, T0) as ReviewEntry;
  const again = createEntry(failed.sessionId, T0 + GIVE_UP_MS * 2);
  assert.deepEqual(again, { sessionId: 's1', state: 'waiting', attempts: 0, nextAt: T0 + GIVE_UP_MS * 2, startedAt: T0 + GIVE_UP_MS * 2 });
});

test('at most one request per session is in flight', () => {
  const entries = [createEntry('a', T0), createEntry('b', T0)];
  assert.deepEqual(planWork(entries, new Set(['a']), T0).due, ['b']);
});

test('attemptReview: finish succeeds', async () => {
  const outcome = await attemptReview('s1', { finish: async () => review('completed'), review: async () => assert.fail('no lookup needed') });
  assert.equal(outcome.kind, 'ready');
});

test('attemptReview: 425 means processing and never reads the stored review', async () => {
  const outcome = await attemptReview('s1', {
    finish: async () => { throw new ApiError('ElevenLabs har ikke samtalen ennå.', 425); },
    review: async () => assert.fail('425 must not look the review up'),
  });
  assert.deepEqual(outcome, { kind: 'processing' });
});

test('attemptReview: a failed finish on an already completed session falls back to the stored review', async () => {
  const outcome = await attemptReview('s1', {
    finish: async () => { throw new ApiError('Opprydding feilet.', 502); },
    review: async () => review('completed'),
  });
  assert.equal(outcome.kind, 'ready');
});

test('attemptReview: other errors fail with the finish message when the session is not completed or the lookup fails', async () => {
  const finish = async () => { throw new ApiError('Tjenesten svarte ikke.', 502); };
  assert.deepEqual(await attemptReview('s1', { finish, review: async () => review('active') }), { kind: 'error', message: 'Tjenesten svarte ikke.' });
  assert.deepEqual(await attemptReview('s1', { finish, review: async () => { throw new Error('offline'); } }), { kind: 'error', message: 'Tjenesten svarte ikke.' });
});

test('stored entries resume after a reload and malformed or stale ones are dropped', () => {
  const now = T0 + 5_000;
  const raw = JSON.stringify([
    { sessionId: 'a', state: 'waiting', attempts: 3, nextAt: now + 99_000, startedAt: T0 },
    { sessionId: 'a', state: 'waiting', attempts: 0, nextAt: 0, startedAt: T0 },
    { sessionId: 'b', state: 'failed', error: 'Feilet.', attempts: 1, nextAt: 0, startedAt: T0 },
    { sessionId: 'c', state: 'waiting', attempts: 0, nextAt: 0, startedAt: now - STALE_MS - 1 },
    { sessionId: 7, state: 'waiting' },
    { sessionId: 'd', state: 'unknown' },
    null,
  ]);
  assert.deepEqual(parseStored(raw, now), [
    { sessionId: 'a', state: 'waiting', error: undefined, attempts: 3, nextAt: now, startedAt: T0 },
    { sessionId: 'b', state: 'failed', error: 'Feilet.', attempts: 1, nextAt: now, startedAt: T0 },
  ]);
  assert.deepEqual(parseStored(null, now), []);
  assert.deepEqual(parseStored('{not json', now), []);
  assert.deepEqual(parseStored('{"a":1}', now), []);
});
