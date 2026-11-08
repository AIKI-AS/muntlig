"use client";
import { useSyncExternalStore } from "react";
import type { Review } from "@/lib/contracts";
import { ApiError, message } from "@/lib/client-api";

/**
 * Reviews of ended voice/avatar sessions are produced in the background. A learner ends a session, the id is
 * queued here, and a worker (review-queue-worker.tsx) calls POST /api/sessions/{id}/finish until ElevenLabs
 * has the transcript. Only ids the learner explicitly ended are ever queued; nothing here can start a conversation.
 */
export type ReviewEntry = {
  sessionId: string;
  state: "waiting" | "failed";
  error?: string;
  /** Number of 425 answers so far in the current run. */
  attempts: number;
  /** Epoch ms of the next request while waiting. */
  nextAt: number;
  /** Epoch ms when the current run began; the give-up deadline counts from here. */
  startedAt: number;
};

export type ReviewOutcome =
  | { kind: "ready"; review: Review }
  | { kind: "processing" }
  | { kind: "error"; message: string };

/** Wait before the next request after the n-th 425: 2 s, 4 s, 8 s, then every 15 s. */
export const BACKOFF_MS = [2_000, 4_000, 8_000] as const;
export const POLL_MS = 15_000;
/** The review is given up on when the next request would fall after this much time. */
export const GIVE_UP_MS = 10 * 60_000;
/** Persisted entries older than this are dropped on load. */
export const STALE_MS = 24 * 60 * 60_000;
export const GIVE_UP_MESSAGE = "Gjennomgangen ble ikke klar innen 10 minutter. Prøv igjen om litt.";

export function retryDelay(attempts: number) {
  return BACKOFF_MS[attempts - 1] ?? POLL_MS;
}

export function createEntry(sessionId: string, now: number): ReviewEntry {
  return { sessionId, state: "waiting", attempts: 0, nextAt: now, startedAt: now };
}

/** Next state of an entry after one request. `null` means the entry is done and leaves the queue. */
export function applyOutcome(entry: ReviewEntry, outcome: ReviewOutcome, now: number): ReviewEntry | null {
  if (outcome.kind === "ready") return null;
  if (outcome.kind === "error") return { ...entry, state: "failed", error: outcome.message };
  const attempts = entry.attempts + 1;
  const nextAt = now + retryDelay(attempts);
  if (nextAt - entry.startedAt > GIVE_UP_MS) return { ...entry, state: "failed", attempts, error: GIVE_UP_MESSAGE };
  return { ...entry, state: "waiting", attempts, nextAt, error: undefined };
}

/** Which waiting entries to request now, and when to wake up for the next one. Entries in flight are skipped. */
export function planWork(entries: Iterable<ReviewEntry>, inFlight: ReadonlySet<string>, now: number) {
  const due: string[] = [];
  let wakeAt: number | null = null;
  for (const entry of entries) {
    if (entry.state !== "waiting" || inFlight.has(entry.sessionId)) continue;
    if (entry.nextAt <= now) due.push(entry.sessionId);
    else if (wakeAt === null || entry.nextAt < wakeAt) wakeAt = entry.nextAt;
  }
  return { due, wakeAt };
}

/**
 * One request for one session. A 425 is not an error: ElevenLabs is still processing. Any other failure is
 * checked against the stored review (read-only GET), because the transcript may already be saved when only the
 * provider cleanup failed, and a second tab or a retry may have finished the session.
 */
export async function attemptReview(
  sessionId: string,
  io: { finish: (id: string) => Promise<Review>; review: (id: string) => Promise<Review> },
): Promise<ReviewOutcome> {
  try {
    return { kind: "ready", review: await io.finish(sessionId) };
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 425) return { kind: "processing" };
    const stored = await io.review(sessionId).catch(() => null);
    if (stored?.session.status === "completed") return { kind: "ready", review: stored };
    return { kind: "error", message: message(failure) };
  }
}

const KEY_PREFIX = "muntlig.pendingReviews.";
const storageKey = (actorId: string) => KEY_PREFIX + actorId;

export function parseStored(raw: string | null, now: number): ReviewEntry[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: ReviewEntry[] = [];
  for (const item of value as Partial<ReviewEntry>[]) {
    if (!item || typeof item.sessionId !== "string" || seen.has(item.sessionId)) continue;
    if (item.state !== "waiting" && item.state !== "failed") continue;
    const startedAt = typeof item.startedAt === "number" && Number.isFinite(item.startedAt) ? item.startedAt : now;
    if (now - startedAt > STALE_MS) continue;
    seen.add(item.sessionId);
    entries.push({
      sessionId: item.sessionId,
      state: item.state,
      error: item.state === "failed" && typeof item.error === "string" ? item.error : undefined,
      attempts: typeof item.attempts === "number" && item.attempts >= 0 ? Math.floor(item.attempts) : 0,
      // A reloaded page asks again at once; the deadline still counts from the original start.
      nextAt: now,
      startedAt,
    });
  }
  return entries;
}

type Snapshot = ReadonlyMap<string, ReviewEntry>;
const EMPTY: Snapshot = new Map();
let actorId: string | null = null;
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function commit(next: Map<string, ReviewEntry>) {
  snapshot = next;
  if (actorId !== null && typeof window !== "undefined") {
    try { window.localStorage.setItem(storageKey(actorId), JSON.stringify([...next.values()])); } catch { /* storage unavailable: the queue still works until reload */ }
  }
  for (const listener of listeners) listener();
}

export const reviewQueue = {
  /** Browser only. Loads this actor's persisted entries; other actors on the machine use other keys. */
  bind(id: string) {
    actorId = id;
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(storageKey(id)); } catch { /* ignore */ }
    snapshot = new Map(parseStored(raw, Date.now()).map((entry) => [entry.sessionId, entry]));
    for (const listener of listeners) listener();
  },
  /** Drops the in-memory queue without touching storage, so the entries resume on the next bind. */
  unbind() {
    actorId = null;
    snapshot = EMPTY;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  snapshot: (): Snapshot => snapshot,
  get: (sessionId: string) => snapshot.get(sessionId),
  /** Queue a session the learner just ended. A session already queued keeps its entry. */
  enqueue(sessionId: string) {
    if (snapshot.has(sessionId)) return;
    commit(new Map(snapshot).set(sessionId, createEntry(sessionId, Date.now())));
  },
  /** Failed entry back to waiting with a fresh run and deadline. */
  retry(sessionId: string) {
    const entry = snapshot.get(sessionId);
    if (entry?.state !== "failed") return;
    commit(new Map(snapshot).set(sessionId, createEntry(sessionId, Date.now())));
  },
  /** Store the result of applyOutcome; null removes the entry. Ignored once the entry is gone. */
  settle(sessionId: string, next: ReviewEntry | null) {
    if (!snapshot.has(sessionId)) return;
    const map = new Map(snapshot);
    if (next) map.set(sessionId, next); else map.delete(sessionId);
    commit(map);
  },
};

/** Queued sessions by id. Empty during SSR and hydration; the worker fills it once the browser is bound. */
export function useReviewQueue(): Snapshot {
  return useSyncExternalStore(reviewQueue.subscribe, reviewQueue.snapshot, () => EMPTY);
}
