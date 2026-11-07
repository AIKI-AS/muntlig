"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import type { Bootstrap, Pack, Session } from "@/lib/contracts";
import { dateLabel } from "@/lib/client-api";
import {
  ActivityPanel,
  SESSION_WINDOW,
  goalStates,
  minutesText,
} from "./activity-visual";
import { Focus, GoalBars, GoalWave, plural } from "./home-focus";
import { Heading, Status } from "./ui";

function latest(sessions: Session[]) {
  return sessions.reduce<Session | null>(
    (best, session) =>
      !best || Date.parse(session.startedAt) > Date.parse(best.startedAt)
        ? session
        : best,
    null,
  );
}

function PackRow({ pack, sessions, capped, teacher }: {
  pack: Pack;
  sessions: Session[];
  capped: boolean;
  teacher: boolean;
}) {
  const mine = sessions.filter((session) => session.packId === pack.id);
  const last = latest(mine);
  const note = last
    ? "Øvd " +
      mine.length +
      " " +
      plural(mine.length, "gang", "ganger") +
      (capped ? " i de siste " + SESSION_WINDOW + " øktene" : "") +
      " · sist "
    : capped
      ? null
      : "Ikke øvd ennå";
  return (
    <li>
      <Link className="dash-pack" href={"/packs/" + pack.id}>
        <GoalBars
          states={last ? goalStates(last) : pack.goals.map(() => "open" as const)}
        />
        <span className="dash-pack-main">
          <strong>{pack.title}</strong>
          <span>
            {pack.subject} · {pack.level} · {pack.minutes} min
          </span>
        </span>
        <span className="dash-pack-state">
          {teacher ? <Status published={pack.status === "published"} /> : null}
          {note ? (
            <span>
              {note}
              {last ? (
                <span suppressHydrationWarning>{dateLabel(last.startedAt)}</span>
              ) : null}
            </span>
          ) : null}
        </span>
        <ArrowRight size={17} className="morph-arrow" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Queue({
  packs,
  sessions,
  capped,
  teacher,
  heading,
}: {
  packs: Pack[];
  sessions: Session[];
  capped: boolean;
  teacher: boolean;
  heading: string;
}) {
  const [subject, setSubject] = useState<string | null>(null);
  const subjects = [...new Set(packs.map((pack) => pack.subject))];
  // A filter only earns its place once there are enough packs across several subjects.
  const filterable = subjects.length >= 3 && packs.length >= 6;
  const shown =
    filterable && subject ? packs.filter((pack) => pack.subject === subject) : packs;
  return (
    <section className="dash-queue dash-rise" style={{ "--n": 2 } as CSSProperties} aria-labelledby="dash-queue-title">
      <div className="dash-section-head">
        <h2 id="dash-queue-title">{heading}</h2>
        <span>
          {shown.length} {plural(shown.length, "fagpakke", "fagpakker")}
        </span>
      </div>
      {filterable ? (
        <div className="dash-chips" role="group" aria-label="Filtrer på fag">
          {[null, ...subjects].map((name) => (
            <button
              key={name ?? "alle"}
              type="button"
              aria-pressed={subject === name}
              onClick={() => setSubject(name)}
            >
              {name ?? "Alle fag"}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="dash-packs">
        {shown.map((pack) => (
          <PackRow
            key={pack.id}
            pack={pack}
            sessions={sessions}
            capped={capped}
            teacher={teacher}
          />
        ))}
      </ul>
    </section>
  );
}

function Recent({ sessions, teacher }: { sessions: Session[]; teacher: boolean }) {
  return (
    <section className="dash-recent dash-rise" style={{ "--n": 3 } as CSSProperties} aria-labelledby="dash-recent-title">
      <div className="dash-section-head">
        <h2 id="dash-recent-title">{teacher ? "Siste prøveøkter" : "Siste øvinger"}</h2>
        <Link className="text-link" href="/sessions">
          Alle økter
          <ArrowRight size={14} className="morph-arrow" aria-hidden="true" />
        </Link>
      </div>
      {sessions.length ? (
        <ul className="dash-packs">
          {sessions.slice(0, 3).map((session) => {
            const states = goalStates(session);
            const explored = states.filter((state) => state !== "open").length;
            const elapsed = session.endedAt
              ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
              : NaN;
            return (
              <li key={session.id}>
                <Link
                  className="dash-pack"
                  href={
                    (session.status === "completed" ? "/review/" : "/practice/") +
                    session.id
                  }
                >
                  <GoalBars states={states} />
                  <span className="dash-pack-main">
                    <strong>{session.pack.title}</strong>
                    <span suppressHydrationWarning>
                      {session.status === "completed" ? "Avsluttet" : "Påbegynt"} ·{" "}
                      {dateLabel(session.startedAt)}
                      {Number.isFinite(elapsed) && elapsed >= 0
                        ? " · " + minutesText(elapsed)
                        : ""}
                    </span>
                  </span>
                  <span className="dash-pack-state">
                    <span>
                      {explored} av {states.length} mål undersøkt
                    </span>
                  </span>
                  <ArrowRight size={17} className="morph-arrow" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dash-recent-empty">
          Ingen økter ennå. Det første forsøket trenger ikke være perfekt.
        </p>
      )}
    </section>
  );
}

export function Home({ data }: { data: Bootstrap }) {
  const teacher = data.actor.role === "teacher";
  const { packs, sessions, integrations } = data;
  const capped = sessions.length >= SESSION_WINDOW;
  const active = sessions.find((session) => session.status === "active") ?? null;
  const published = packs.filter((pack) => pack.status === "published");
  const practised = new Set(sessions.map((session) => session.packId));
  // Next pack to open: first published one not seen in the loaded sessions; a teacher with only drafts gets the newest draft.
  const next = active
    ? null
    : (published.find((pack) => !practised.has(pack.id)) ??
      published[0] ??
      (teacher ? packs[0] : undefined) ??
      null);
  const focusPack = active ? active.pack : next;
  const queue = packs.filter((pack) => pack.id !== focusPack?.id);
  return (
    <div className="page home-page">
      <Heading
        title={"Hei, " + data.actor.displayName.split(" ")[0] + "."}
        description={
          teacher
            ? "Hvilket fag skal få en god samtale i dag?"
            : "Hva vil du forstå litt bedre i dag?"
        }
        action={
          teacher ? (
            <Link className="button primary" href="/new">
              Ny fagpakke
              <ArrowRight size={16} className="morph-arrow" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <div className="dash-grid">
        {focusPack ? (
          <Focus
            key={active?.id ?? focusPack.id}
            session={active}
            pack={focusPack}
            teacher={teacher}
            integrations={integrations}
          />
        ) : (
          <section className="dash-empty dash-rise" aria-labelledby="dash-empty-title">
            <span className="dash-empty-waves" aria-hidden="true">
              {[0, 1, 2].map((goal) => (
                <GoalWave key={goal} state="open" />
              ))}
            </span>
            <h2 id="dash-empty-title">
              {teacher
                ? "En god samtale starter med godt innhold."
                : "Ingen fagpakke er publisert ennå."}
            </h2>
            <p>
              {teacher
                ? "Last opp ditt eget materiale, eller prøv et ferdig øvingsnotat om demokrati. Du kontrollerer alt før publisering."
                : "Læreren din må publisere en fagpakke før du kan øve. Den dukker opp her så snart den er klar."}
            </p>
            {teacher ? (
              <Link className="button secondary" href="/new/example">
                Bruk åpent øvingsmateriale
                <ArrowRight size={16} className="morph-arrow" aria-hidden="true" />
              </Link>
            ) : null}
          </section>
        )}
        <ActivityPanel sessions={sessions} packs={packs} teacher={teacher} />
        {queue.length ? (
          <Queue
            packs={queue}
            sessions={sessions}
            capped={capped}
            teacher={teacher}
            heading={
              next
                ? teacher
                  ? "Dine andre fagpakker"
                  : "Flere å øve på"
                : teacher
                  ? "Dine fagpakker"
                  : "Klart til øving"
            }
          />
        ) : null}
        <Recent sessions={sessions} teacher={teacher} />
      </div>
    </div>
  );
}
