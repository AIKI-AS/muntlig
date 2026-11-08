"use client";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { ArrowRight } from "lucide-react";
import type { Pack, Session } from "@/lib/contracts";
import { practiceGoals } from "@/lib/practice-plan";

/** listSessions() in src/server/practice.ts returns at most this many rows, newest first. */
export const SESSION_WINDOW = 20;
const DAYS = 14;

export type GoalState = "independent" | "with_hint" | "open";

/**
 * Per goal the student chose to practise (practiceGoals, never the full pack): evidence only counts
 * when it still points to a real student turn for that goal that literally contains the quote.
 * Mirrors buildReview in src/server/domain.ts.
 */
export function goalStates(session: Session): GoalState[] {
  return practiceGoals(session).map((goal) => {
    for (const item of session.evidence) {
      if (item.goalId !== goal.id) continue;
      if (item.status !== "independent" && item.status !== "with_hint")
        continue;
      const index = session.turns.findIndex((turn) => turn.id === item.turnId);
      const turn = session.turns[index];
      if (!turn || turn.role !== "user" || turn.goalId !== goal.id) continue;
      if (!item.quote || !turn.text.includes(item.quote)) continue;
      const hinted = session.turns
        .slice(0, index)
        .some(
          (earlier) =>
            earlier.role === "assistant" &&
            earlier.goalId === goal.id &&
            earlier.hint,
        );
      return hinted ? "with_hint" : item.status;
    }
    return "open";
  });
}

/** Whole minutes from a real endedAt - startedAt difference. */
export function minutesText(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (ms > 0 && minutes === 0) return "<1 min";
  if (minutes < 60) return minutes + " min";
  const rest = minutes % 60;
  return Math.floor(minutes / 60) + " t" + (rest ? " " + rest + " min" : "");
}

function timeParts(ms: number): { n: string; u: string }[] {
  const minutes = Math.round(ms / 60000);
  if (ms > 0 && minutes === 0) return [{ n: "<1", u: "min" }];
  if (minutes < 60) return [{ n: String(minutes), u: "min" }];
  const rest = minutes % 60;
  const parts = [{ n: String(Math.floor(minutes / 60)), u: "t" }];
  if (rest) parts.push({ n: String(rest), u: "min" });
  return parts;
}

export function summarize(sessions: Session[]) {
  const ordered = [...sessions].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  const ticks: ("done" | "live")[] = [];
  const durations: number[] = [];
  let completed = 0,
    active = 0,
    ms = 0,
    goalsTotal = 0,
    independent = 0,
    withHint = 0;
  for (const session of ordered) {
    if (session.status === "completed") {
      completed++;
      ticks.push("done");
      if (session.endedAt) {
        const elapsed = Date.parse(session.endedAt) - Date.parse(session.startedAt);
        if (Number.isFinite(elapsed) && elapsed >= 0) {
          ms += elapsed;
          durations.push(elapsed);
        }
      }
    } else {
      active++;
      ticks.push("live");
    }
    for (const state of goalStates(session)) {
      goalsTotal++;
      if (state === "independent") independent++;
      if (state === "with_hint") withHint++;
    }
  }
  return {
    completed,
    active,
    ms,
    durations,
    ticks,
    goalsTotal,
    independent,
    withHint,
  };
}

const localKey = (date: Date) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
const keyToDate = (key: number) =>
  new Date(Math.floor(key / 10000), (Math.floor(key / 100) % 100) - 1, key % 100);

type Day = {
  date: Date;
  key: number;
  done: number;
  live: number;
  unknown: boolean;
};

/** Sessions per user-local calendar day of startedAt, for the last DAYS days ending today. */
function dayBuckets(sessions: Session[], todayKey: number, capped: boolean) {
  const today = keyToDate(todayKey);
  const days: Day[] = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (DAYS - 1 - i),
    );
    return { date, key: localKey(date), done: 0, live: 0, unknown: false };
  });
  const byKey = new Map(days.map((day) => [day.key, day]));
  let oldest = Infinity;
  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const key = localKey(started);
    oldest = Math.min(oldest, key);
    const day = byKey.get(key);
    if (!day) continue;
    if (session.status === "completed") day.done++;
    else day.live++;
  }
  // The server returns only the newest sessions: days before the oldest loaded one are unknown, not empty.
  if (capped) for (const day of days) day.unknown = day.key < oldest;
  return days;
}

const subscribe = () => () => {};

/** False during SSR and hydration; true once local-time values may be rendered. */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Server and hydration pass assume motion is fine; the decorative effects only start on the client. */
function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

const COUNT_MS = 800;

/**
 * Shows the target until animation is allowed (server markup and hydration are already final). Once
 * enabled on the client and motion is allowed it runs 0 -> target with an ease-out curve; a target that
 * has not started animating yet renders as 0 so the final number never flashes first.
 */
function useCountUp(target: number, enabled: boolean) {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState<{ target: number; t: number } | null>(null);
  const animate = enabled && !reduced;
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - started) / COUNT_MS));
      setProgress({ target, t });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);
  if (!animate) return target;
  if (progress?.target !== target) return 0;
  return Math.round(target * (1 - Math.pow(1 - progress.t, 3)));
}

function CountUp({ to, enabled, suffix }: { to: number; enabled: boolean; suffix?: string }) {
  const value = useCountUp(to, enabled);
  return (
    <span aria-hidden="true">
      {value}
      {suffix}
    </span>
  );
}

function activeDayKeys(sessions: Session[]) {
  const days = new Set<number>();
  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (!Number.isNaN(started.getTime())) days.add(localKey(started));
  }
  return days;
}

/** Distinct user-local calendar days on which a loaded session was started. */
export function activeDayCount(sessions: Session[]) {
  return activeDayKeys(sessions).size;
}

const shiftDay = (key: number, delta: number) => {
  const date = keyToDate(key);
  return localKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta));
};

/**
 * Consecutive active local days: counted back from today when today has a started session, otherwise
 * from yesterday, otherwise 0. `open` means the run reaches the oldest loaded day of a capped window,
 * so the real streak may be longer than `days`.
 */
export function streakDays(
  sessions: Session[],
  todayKey: number,
  capped: boolean,
): { days: number; open: boolean } {
  const active = activeDayKeys(sessions);
  let key = active.has(todayKey) ? todayKey : shiftDay(todayKey, -1);
  let days = 0;
  let last = key;
  while (active.has(key)) {
    days++;
    last = key;
    key = shiftDay(key, -1);
  }
  const oldest = Math.min(...active);
  return { days, open: capped && days > 0 && last === oldest };
}

/** The last `count` local days ending today, oldest first, with whether a session was started that day. */
export function recentDays(sessions: Session[], todayKey: number, count: number) {
  const active = activeDayKeys(sessions);
  return Array.from({ length: count }, (_, i) => {
    const key = shiftDay(todayKey, -(count - 1 - i));
    return { key, date: keyToDate(key), active: active.has(key), today: i === count - 1 };
  });
}

const dayFull = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayShort = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
});
const sessionWord = (n: number) => (n === 1 ? "økt" : "økter");

const RING_R = 64;
/** Round caps overhang the dash by half the stroke width (6 units): this is that overhang in percent of the circle. */
const CAP_PCT = (6 / (2 * Math.PI * RING_R)) * 100;
/** Visible gap between ring arcs, in percent of the circle: two round caps plus air. */
const ARC_GAP = 2 * CAP_PCT + 1.6;

function ringArc(start: number, share: number) {
  if (share >= 100) return { dash: 100, start: 0 };
  return { dash: Math.max(0.01, share - ARC_GAP), start: start + ARC_GAP / 2 };
}

function MasteryRing({
  independent,
  withHint,
  total,
  ready,
}: {
  independent: number;
  withHint: number;
  total: number;
  ready: boolean;
}) {
  const explored = independent + withHint;
  const first = total ? (independent / total) * 100 : 0;
  const second = total ? (withHint / total) * 100 : 0;
  const arcs = [
    independent ? { cls: "is-independent", ...ringArc(0, first), delay: 0 } : null,
    withHint ? { cls: "is-with_hint", ...ringArc(first, second), delay: 320 } : null,
  ];
  return (
    <div
      className="act-ring"
      title={
        total
          ? independent +
            " selvstendig, " +
            withHint +
            " med hint, " +
            (total - explored) +
            " ikke undersøkt"
          : undefined
      }
    >
      <svg viewBox="0 0 160 160" focusable="false">
        <circle className="act-track" cx="80" cy="80" r={RING_R} />
        {arcs.map((arc) =>
          arc ? (
            <circle
              key={arc.cls}
              className={"act-arc " + arc.cls}
              cx="80"
              cy="80"
              r={RING_R}
              pathLength={100}
              strokeDasharray={arc.dash + " 100"}
              style={
                {
                  "--rot": -90 + arc.start * 3.6 + "deg",
                  "--len": arc.dash,
                  "--delay": arc.delay + "ms",
                } as CSSProperties
              }
            />
          ) : null,
        )}
      </svg>
      <div className="act-ring-centre">
        <span className="dash-fig act-ring-n">
          <CountUp to={explored} enabled={ready} />
          <span className="dash-unit"> / {total}</span>
        </span>
        <span className="act-label">mål klart</span>
      </div>
    </div>
  );
}

export function ActivityPanel({
  sessions,
  packs,
  teacher,
}: {
  sessions: Session[];
  packs: Pack[];
  teacher: boolean;
}) {
  // Local calendar day exists only in the browser: the server snapshot is null so SSR and hydration match.
  const todayKey = useSyncExternalStore(
    subscribe,
    () => localKey(new Date()),
    () => null,
  );
  const capped = sessions.length >= SESSION_WINDOW;
  const sum = useMemo(() => summarize(sessions), [sessions]);
  const days = useMemo(
    () => (todayKey === null ? null : dayBuckets(sessions, todayKey, capped)),
    [sessions, todayKey, capped],
  );
  const streak = useMemo(
    () => (todayKey === null ? null : streakDays(sessions, todayKey, capped)),
    [sessions, todayKey, capped],
  );
  const streakDots = useMemo(
    () => (todayKey === null ? null : recentDays(sessions, todayKey, 7)),
    [sessions, todayKey],
  );
  const ready = days !== null;
  const inWindow = days
    ? days.reduce((total, day) => total + day.done + day.live, 0)
    : 0;
  const scale = days
    ? Math.max(3, ...days.map((day) => day.done + day.live))
    : 3;
  const explored = sum.independent + sum.withHint;
  const publishedCount = packs.filter((pack) => pack.status === "published").length;
  const draftCount = packs.length - publishedCount;
  const time = timeParts(sum.ms);
  return (
    <section
      className="dash-panel dash-rise"
      style={{ "--n": 1 } as CSSProperties}
      aria-labelledby="dash-panel-title"
    >
      <header className="dash-panel-head">
        <h2 id="dash-panel-title">{teacher ? "Dine prøveøkter" : "Din øving"}</h2>
        <span>{DAYS} dager</span>
      </header>
      <div className="act" data-ready={ready ? "true" : "false"}>
        <div className="act-hero" aria-hidden="true">
          <MasteryRing
            independent={sum.independent}
            withHint={sum.withHint}
            total={sum.goalsTotal}
            ready={ready}
          />
          {sum.goalsTotal ? (
            <ul className="act-legend">
              <li>
                <i className="is-independent" />
                {sum.independent} selvstendig
              </li>
              <li>
                <i className="is-with_hint" />
                {sum.withHint} med hint
              </li>
            </ul>
          ) : null}
        </div>
        <div className="act-tiles" aria-hidden="true">
          <div
            className="act-tile"
            title={
              sum.durations.length
                ? "Fra start til avslutning, " +
                  sum.durations.length +
                  " fullførte " +
                  sessionWord(sum.durations.length)
                : "Vises når en økt er avsluttet"
            }
          >
            <div className="act-eq" data-live={sum.ms > 0 || undefined}>
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} style={{ "--b": i } as CSSProperties} />
              ))}
            </div>
            <div className="dash-fig">
              {time.map((part) => (
                <span key={part.u}>
                  {part.n}
                  <span className="dash-unit">{part.u}</span>{" "}
                </span>
              ))}
            </div>
            <span className="act-label">snakket</span>
          </div>
          <div className="act-tile">
            <div className="act-dots">
              {(streakDots ?? Array.from({ length: 7 }, () => null)).map((dot, i) => (
                <i
                  key={i}
                  data-on={dot?.active || undefined}
                  data-today={dot?.today || undefined}
                  title={dot ? dayFull.format(dot.date) : undefined}
                />
              ))}
            </div>
            <div className="dash-fig">
              {streak ? (
                <CountUp to={streak.days} enabled={ready} suffix={streak.open ? "+" : undefined} />
              ) : (
                "–"
              )}
            </div>
            <span className="act-label">på rad</span>
          </div>
        </div>
        <figure className="act-wave-fig" aria-hidden="true">
          <p className="act-total">
            <span className="dash-fig">
              {days ? <CountUp to={inWindow} enabled={ready} /> : "–"}
            </span>
            <span className="act-label">{sessionWord(inWindow)}</span>
          </p>
          <div className="act-wave">
            {(days ?? Array.from({ length: DAYS }, () => null)).map((day, i) => {
              const total = day ? day.done + day.live : 0;
              return (
                <div
                  className="act-cap"
                  key={i}
                  data-unknown={day?.unknown || undefined}
                  title={
                    day
                      ? dayFull.format(day.date) +
                        (day.unknown
                          ? ": ikke med i utvalget"
                          : ": " + day.done + " fullført, " + day.live + " påbegynt")
                      : undefined
                  }
                >
                  {day && total > 0 ? (
                    <span
                      className="act-bar"
                      data-today={i === DAYS - 1 || undefined}
                      style={
                        {
                          height: Math.max(12, (total / scale) * 100) + "%",
                          "--i": i,
                        } as CSSProperties
                      }
                    >
                      <span className="act-glow" />
                      <span className="act-stack">
                        {day.live ? (
                          <i className="is-live" style={{ flexGrow: day.live }} />
                        ) : null}
                        {day.done ? (
                          <i className="is-done" style={{ flexGrow: day.done }} />
                        ) : null}
                      </span>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {days ? (
            <p className="act-range">
              <span>{dayShort.format(days[0].date)}</span>
              <span>I dag</span>
            </p>
          ) : null}
        </figure>
        {teacher ? (
          <div
            className="act-tile act-tile-wide"
            aria-hidden="true"
            title={draftCount ? draftCount + " utkast venter" : "Ingen utkast venter"}
          >
            <div className="dash-fig">
              {publishedCount}/{packs.length}
            </div>
            <span className="act-label">publisert</span>
            <div className="dash-ticks">
              {packs.slice(0, 12).map((pack) => (
                <i
                  key={pack.id}
                  className={pack.status === "published" ? "is-done" : "is-live"}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="sr-only">
          <dl>
            <dt>Mål undersøkt</dt>
            <dd>
              {explored} av {sum.goalsTotal}, {sum.independent} selvstendig, {sum.withHint} med hint
            </dd>
            <dt>Snakketid</dt>
            <dd>{minutesText(sum.ms)}</dd>
            <dt>Dager på rad</dt>
            <dd>{streak ? streak.days + (streak.open ? " eller flere" : "") : "Henter dagene dine"}</dd>
            <dt>Økter startet siste {DAYS} dager</dt>
            <dd>{days ? inWindow : "Henter dagene dine"}</dd>
            {teacher ? (
              <>
                <dt>Publiserte fagpakker</dt>
                <dd>
                  {publishedCount} av {packs.length}, {draftCount} utkast
                </dd>
              </>
            ) : null}
          </dl>
          {days ? (
            <table>
              <caption>
                Økter startet per dag, siste {DAYS} dager. Fullførte og påbegynte.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Dag</th>
                  <th scope="col">Fullført</th>
                  <th scope="col">Påbegynt</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.key}>
                    <th scope="row">{dayFull.format(day.date)}</th>
                    <td>{day.unknown ? "ikke med i utvalget" : day.done}</td>
                    <td>{day.unknown ? "ikke med i utvalget" : day.live}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
      {capped ? (
        <p className="dash-foot">
          Viser de {SESSION_WINDOW} siste øktene.{" "}
          <Link className="dash-link" href="/sessions">
            Se alle
            <ArrowRight size={13} className="morph-arrow" aria-hidden="true" />
          </Link>
        </p>
      ) : null}
    </section>
  );
}
