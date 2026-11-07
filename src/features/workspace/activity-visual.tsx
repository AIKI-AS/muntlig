"use client";
import Link from "next/link";
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import type { Pack, Session } from "@/lib/contracts";

/** listSessions() in src/server/practice.ts returns at most this many rows, newest first. */
export const SESSION_WINDOW = 20;
const DAYS = 14;

export type GoalState = "independent" | "with_hint" | "open";

/**
 * Per goal of the pinned pack: evidence only counts when it still points to a real student
 * turn for that goal that literally contains the quote. Mirrors buildReview in src/server/domain.ts.
 */
export function goalStates(session: Session): GoalState[] {
  return session.pack.goals.map((goal) => {
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
const dayFull = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayShort = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
});
const weekdayInitial = new Intl.DateTimeFormat("nb-NO", { weekday: "narrow" });
const sessionWord = (n: number) => (n === 1 ? "økt" : "økter");

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
  const inWindow = days
    ? days.reduce((total, day) => total + day.done + day.live, 0)
    : 0;
  const scale = days
    ? Math.max(3, ...days.map((day) => day.done + day.live))
    : 3;
  const explored = sum.independent + sum.withHint;
  const publishedCount = packs.filter((pack) => pack.status === "published").length;
  const draftCount = packs.length - publishedCount;
  const nothingYet = sessions.length === 0;
  return (
    <section
      className="dash-panel dash-rise"
      style={{ "--n": 1 } as CSSProperties}
      aria-labelledby="dash-panel-title"
    >
      <header className="dash-panel-head">
        <h2 id="dash-panel-title">{teacher ? "Dine prøveøkter" : "Din øving"}</h2>
        <span>Siste {DAYS} dager</span>
      </header>
      <figure className="dash-chart" data-ready={days ? "true" : "false"}>
        <figcaption>
          {days ? (
            inWindow ? (
              <>
                <strong>{inWindow}</strong> {sessionWord(inWindow)} startet
              </>
            ) : (
              <>Ingen økter startet de siste {DAYS} dagene</>
            )
          ) : (
            <>Henter dagene dine</>
          )}
        </figcaption>
        <div className="dash-plot">
          {days ? <span className="dash-scale">{scale}</span> : null}
          <div className="dash-bars" aria-hidden="true">
            {(days ?? Array.from({ length: DAYS }, () => null)).map((day, i) => (
              <div
                className="dash-bar"
                key={i}
                data-unknown={day?.unknown || undefined}
                title={
                  day
                    ? dayFull.format(day.date) +
                      (day.unknown
                        ? ": ikke med i utvalget"
                        : ": " +
                          day.done +
                          " fullført, " +
                          day.live +
                          " påbegynt")
                    : undefined
                }
              >
                {day && day.done + day.live > 0 ? (
                  <span
                    className="dash-stack"
                    style={
                      {
                        height: ((day.done + day.live) / scale) * 100 + "%",
                        "--i": i,
                      } as CSSProperties
                    }
                  >
                    {day.live ? (
                      <i className="is-live" style={{ flexGrow: day.live }} />
                    ) : null}
                    {day.done ? (
                      <i className="is-done" style={{ flexGrow: day.done }} />
                    ) : null}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="dash-axis" aria-hidden="true">
          {(days ?? []).map((day, i) => (
            <span key={i} data-today={i === DAYS - 1 || undefined}>
              {weekdayInitial.format(day.date)}
            </span>
          ))}
        </div>
        {days ? (
          <p className="dash-range" aria-hidden="true">
            <span>{dayShort.format(days[0].date)}</span>
            <span>I dag</span>
          </p>
        ) : null}
        {days ? (
          <div className="sr-only"><table>
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
          </table></div>
        ) : null}
        {nothingYet ? (
          <p className="dash-chart-empty">
            Ingen økter ennå. Dagene du øver vises her, og tallene under er
            null til du har startet.
          </p>
        ) : null}
      </figure>
      <dl className="dash-kpis" data-ready={days ? "true" : "false"}>
        <div className="dash-kpi">
          <dt>{teacher ? "Fullførte prøveøkter" : "Fullførte økter"}</dt>
          <dd className="dash-fig">{sum.completed}</dd>
          <dd className="dash-viz" aria-hidden="true">
            <div className="dash-ticks">
              {sum.ticks.map((tick, i) => (
                <i key={i} className={"is-" + tick} />
              ))}
            </div>
          </dd>
          <dd className="dash-sub">
            {nothingYet
              ? "Ingen startet ennå"
              : sum.active
                ? sum.active + " påbegynt og ikke avsluttet"
                : "Ingen påbegynte økter"}
          </dd>
        </div>
        <div className="dash-kpi">
          <dt>Tid brukt</dt>
          <dd className="dash-fig">
            {timeParts(sum.ms).map((part) => (
              <span key={part.u}>
                {part.n}
                <span className="dash-unit">{part.u}</span>{" "}
              </span>
            ))}
          </dd>
          <dd className="dash-viz" aria-hidden="true">
            <div className="dash-timebar">
              {sum.durations
                .filter((ms) => ms > 0)
                .map((ms, i) => (
                  <i key={i} style={{ flexGrow: ms }} />
                ))}
            </div>
          </dd>
          <dd className="dash-sub">
            {sum.durations.length
              ? "Fra start til avslutning, " +
                sum.durations.length +
                " fullførte " +
                sessionWord(sum.durations.length)
              : "Vises når en økt er avsluttet"}
          </dd>
        </div>
        <div className="dash-kpi">
          <dt>Mål undersøkt</dt>
          <dd className="dash-fig">
            {explored}
            <span className="dash-unit"> av {sum.goalsTotal}</span>
          </dd>
          <dd className="dash-viz" aria-hidden="true">
            <div className="dash-goalbar">
              {sum.independent ? (
                <i className="is-independent" style={{ flexGrow: sum.independent }} />
              ) : null}
              {sum.withHint ? (
                <i className="is-with_hint" style={{ flexGrow: sum.withHint }} />
              ) : null}
              {sum.goalsTotal - explored > 0 ? (
                <i className="is-open" style={{ flexGrow: sum.goalsTotal - explored }} />
              ) : null}
            </div>
          </dd>
          <dd className="dash-sub">
            {sum.goalsTotal ? (
              <>
                {sum.independent} selvstendig, {sum.withHint} med støtte.{" "}
                <Link className="dash-link" href="/sessions">
                  Se i økthistorikken
                  <ArrowRight size={13} className="morph-arrow" aria-hidden="true" />
                </Link>
              </>
            ) : (
              "Telles fra svarene dine i samtalen"
            )}
          </dd>
        </div>
        {teacher ? (
          <div className="dash-kpi">
            <dt>Publiserte fagpakker</dt>
            <dd className="dash-fig">
              {publishedCount}
              <span className="dash-unit"> av {packs.length}</span>
            </dd>
            <dd className="dash-viz" aria-hidden="true">
              <div className="dash-ticks">
                {packs.slice(0, 12).map((pack) => (
                  <i
                    key={pack.id}
                    className={
                      pack.status === "published" ? "is-done" : "is-live"
                    }
                  />
                ))}
              </div>
            </dd>
            <dd className="dash-sub">
              {draftCount
                ? draftCount + " utkast venter"
                : "Ingen utkast venter"}
            </dd>
          </div>
        ) : null}
      </dl>
      {sessions.length ? (
        <p className="dash-foot">
          Bygger på {capped ? "de " + SESSION_WINDOW + " siste" : "dine"}{" "}
          {sessions.length} {sessionWord(sessions.length)}
          {capped ? ". Eldre økter er ikke med." : "."}
        </p>
      ) : null}
    </section>
  );
}
