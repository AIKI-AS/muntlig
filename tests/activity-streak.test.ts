import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '../src/lib/contracts';
import { recentDays, streakDays } from '../src/features/workspace/activity-visual';

// Local noon avoids any DST or timezone edge: the streak logic works on user-local calendar days.
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12, 0, 0);
const key = (date: Date) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
const session = (date: Date) => ({ startedAt: date.toISOString() }) as Session;

const today = at(2026, 11, 8);
const todayKey = key(today);
const daysAgo = (n: number) => at(2026, 11, 8 - n);
const sessionsOn = (...offsets: number[]) => offsets.map((n) => session(daysAgo(n)));

test('streak counts back from today when today is active', () => {
  assert.deepEqual(streakDays(sessionsOn(0, 1, 2), todayKey, false), { days: 3, open: false });
});

test('streak counts back from yesterday when only today is empty', () => {
  assert.deepEqual(streakDays(sessionsOn(1, 2), todayKey, false), { days: 2, open: false });
});

test('a gap breaks the streak', () => {
  assert.deepEqual(streakDays(sessionsOn(0, 1, 3, 4, 5), todayKey, false), { days: 2, open: false });
});

test('streak is 0 when neither today nor yesterday is active', () => {
  assert.deepEqual(streakDays(sessionsOn(2, 3), todayKey, false), { days: 0, open: false });
  assert.deepEqual(streakDays([], todayKey, false), { days: 0, open: false });
});

test('several sessions on one day count as one day', () => {
  assert.deepEqual(streakDays([...sessionsOn(0, 0, 0), ...sessionsOn(1)], todayKey, false), { days: 2, open: false });
});

test('streak crosses month and year boundaries on local days', () => {
  const newYear = key(at(2027, 1, 1));
  const sessions = [session(at(2027, 1, 1)), session(at(2026, 12, 31)), session(at(2026, 12, 30))];
  assert.deepEqual(streakDays(sessions, newYear, false), { days: 3, open: false });
});

test('a capped window whose streak reaches the oldest loaded day is open', () => {
  assert.deepEqual(streakDays(sessionsOn(0, 1, 2), todayKey, true), { days: 3, open: true });
});

test('a capped window with a gap before the oldest loaded day is closed', () => {
  assert.deepEqual(streakDays(sessionsOn(0, 1, 4), todayKey, true), { days: 2, open: false });
});

test('recentDays lists seven local days ending today and flags active ones', () => {
  const dots = recentDays(sessionsOn(0, 2), todayKey, 7);
  assert.equal(dots.length, 7);
  assert.deepEqual(dots.map((dot) => dot.active), [false, false, false, false, true, false, true]);
  assert.equal(dots[6].today, true);
  assert.equal(dots[6].key, todayKey);
  assert.equal(dots[0].key, key(daysAgo(6)));
});
