"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  evidenceLabels,
  type Session,
  type SessionPage,
} from "@/lib/contracts";
import { api, message } from "@/lib/client-api";
import { practiceFocusLabels, practiceGoals } from "@/lib/practice-plan";
import { goalStates, minutesText } from "./activity-visual";
import { GoalBars, plural } from "./home-focus";
import { Empty, ErrorNotice, Heading, Loading } from "./ui";

const modeLabels = { text: "Tekst", voice: "Tale", avatar: "Avatar" } as const;
const startedFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function fetchPage(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<SessionPage> {
  const page = await api<unknown>(
    cursor === null
      ? "/api/sessions"
      : "/api/sessions?cursor=" + encodeURIComponent(cursor),
    { signal },
  );
  const candidate = page as Partial<SessionPage> | null;
  if (
    !candidate ||
    !Array.isArray(candidate.sessions) ||
    !(candidate.nextCursor === null || typeof candidate.nextCursor === "string")
  )
    throw new Error("Vi fikk et uventet svar fra serveren. Prøv igjen.");
  return candidate as SessionPage;
}

/** Union by id (later wins), newest first. Rows already on screen are never dropped. */
function mergeRows(base: Session[], incoming: Session[]) {
  const byId = new Map<string, Session>();
  for (const session of base) byId.set(session.id, session);
  for (const session of incoming) byId.set(session.id, session);
  return [...byId.values()].sort(
    (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0),
  );
}

function Row({ session }: { session: Session }) {
  const goals = practiceGoals(session);
  const states = goalStates(session);
  const explored = states.filter((state) => state !== "open").length;
  const completed = session.status === "completed";
  const elapsed = session.endedAt
    ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
    : NaN;
  const request = session.plan.request.trim();
  return (
    <li className="hist-row" data-status={session.status}>
      <GoalBars states={states} />
      <div className="hist-main">
        <h3 className="hist-title">
          <Link
            className="hist-link"
            href={(completed ? "/review/" : "/practice/") + session.id}
          >
            {session.pack.title}
            <span className="sr-only">
              {completed ? " – åpne gjennomgangen" : " – fortsett økten"}
            </span>
          </Link>
        </h3>
        <p className="hist-meta">
          <span suppressHydrationWarning>
            {startedFormat.format(new Date(session.startedAt))}
          </span>
          <span>{session.pack.subject}</span>
          <span>{modeLabels[session.mode]}</span>
          <span>{practiceFocusLabels[session.plan.focus]}</span>
          {completed && Number.isFinite(elapsed) && elapsed >= 0 ? (
            <span>{minutesText(elapsed)}</span>
          ) : null}
        </p>
        {request ? (
          <p className="hist-request">
            <span>Ønske til samtalen:</span> {request}
          </p>
        ) : null}
        <ul className="hist-goals" aria-label="Målene i økten">
          {goals.map((goal, i) => {
            const state = states[i] ?? "open";
            return (
              <li key={goal.id} data-state={state}>
                <i aria-hidden="true" />
                <span>{goal.title}</span>
                <em>
                  {state === "open"
                    ? completed
                      ? evidenceLabels.not_explored
                      : "Ikke undersøkt ennå"
                    : evidenceLabels[state]}
                </em>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="hist-side">
        <span className="hist-status" data-status={session.status}>
          {completed ? "Avsluttet" : "Pågår"}
        </span>
        <span className="hist-count">
          {explored} av {goals.length} mål undersøkt
        </span>
        <span className="hist-cta" aria-hidden="true">
          {completed ? "Se gjennomgang" : "Fortsett"}
          <ArrowRight size={15} className="morph-arrow" />
        </span>
      </div>
    </li>
  );
}

/**
 * Own saved sessions. `sessions` is the newest-20 bootstrap snapshot: shown at once, then merged with
 * the canonical first page of GET /api/sessions, and older pages are appended on request.
 * A failed refresh or page never removes rows that are already visible.
 */
export function History({
  sessions,
  student = false,
}: {
  sessions: Session[];
  student?: boolean;
}) {
  const [fetched, setFetched] = useState<Session[]>([]);
  // undefined: first page not confirmed yet. null: nothing older exists. string: more pages.
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [first, setFirst] = useState<"loading" | "ready" | "error">("loading");
  const [firstError, setFirstError] = useState<string | null>(null);
  const [older, setOlder] = useState<"idle" | "loading" | "error">("idle");
  const [olderError, setOlderError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPage(null, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      setFetched(rows => mergeRows(rows, page.sessions));
      setCursor(current => current === undefined ? page.nextCursor : current);
      setFirst("ready");
    }).catch(error => {
      if (controller.signal.aborted) return;
      setFirst("error");
      setFirstError(message(error));
    });
    return () => controller.abort();
  }, [attempt]);

  async function loadOlder() {
    if (typeof cursor !== "string" || busy.current) return;
    busy.current = true;
    setOlder("loading");
    setOlderError(null);
    try {
      const page = await fetchPage(cursor);
      setFetched((rows) => mergeRows(rows, page.sessions));
      setCursor(page.nextCursor);
      setOlder("idle");
      setAnnounce(
        page.sessions.length +
          " eldre " +
          plural(page.sessions.length, "økt", "økter") +
          " lagt til i listen.",
      );
    } catch (error) {
      setOlder("error");
      setOlderError(message(error));
    } finally {
      busy.current = false;
    }
  }

  const rows = useMemo(() => mergeRows(sessions, fetched), [sessions, fetched]);
  const count = rows.length + " " + plural(rows.length, "økt", "økter");
  const countNote =
    cursor === null
      ? count
      : typeof cursor === "string"
        ? count + " vist · flere finnes"
        : count +
          " vist" +
          (first === "loading" ? " · oppdaterer" : " · ikke oppdatert");

  const refreshAlert = firstError ? (
    <div className="hist-alert">
      <ErrorNotice>
        {firstError}
        {rows.length ? " Øktene under er de vi allerede hadde." : ""}
      </ErrorNotice>
      <button
        type="button"
        className="button secondary"
        aria-disabled={first === "loading"}
        onClick={() => {
          if (first === "loading") return;
          document.getElementById("main-content")?.focus({ preventScroll: true });
          setFirst("loading");
          setFirstError(null);
          setAttempt(current => current + 1);
        }}
      >
        Prøv igjen
      </button>
    </div>
  ) : null;

  return (
    <div className="page history-page">
      <Heading title="Mine økter" />
      {rows.length ? (
        <section className="all-sessions hist" aria-labelledby="hist-title">
          <div className="section-heading">
            <h2 id="hist-title">Økthistorikk</h2>
            <span className="muted">{countNote}</span>
          </div>
          {refreshAlert}
          <ul className="hist-list">
            {rows.map((session) => (
              <Row key={session.id} session={session} />
            ))}
          </ul>
          <div className="hist-more">
            {typeof cursor === "string" ? (
              <>
                {older === "error" ? (
                  <div className="hist-alert">
                    <ErrorNotice>
                      {olderError ?? "Vi fikk ikke hentet eldre økter."} Øktene
                      over vises fortsatt.
                    </ErrorNotice>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="button secondary"
                  aria-disabled={older === "loading"}
                  aria-busy={older === "loading"}
                  onClick={() => void loadOlder()}
                >
                  {older === "loading"
                    ? "Henter eldre økter …"
                    : older === "error"
                      ? "Prøv igjen"
                      : "Vis eldre økter"}
                </button>
              </>
            ) : cursor === null ? (
              <p className="hist-end">Det er alle øktene dine.</p>
            ) : null}
          </div>
          <p className="sr-only" role="status">
            {announce}
          </p>
        </section>
      ) : first === "loading" ? (
        <Loading label="Henter øktene dine …" layout="history" />
      ) : first === "error" ? (
        refreshAlert
      ) : (
        <Empty
          title="Din første fagprat ligger foran deg."
          action={
            <Link
              className="button secondary"
              href={student ? "/muntlig" : "/"}
            >
              {student ? "Start din første samtale" : "Finn en fagpakke"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        >
          Etter øving får du en gjennomgang med dine egne svar og fagstoffet bak
          samtalen.
        </Empty>
      )}
    </div>
  );
}