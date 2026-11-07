"use client";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, FileText, Plus } from "lucide-react";
import type { Bootstrap } from "@/lib/contracts";
import { dateLabel } from "@/lib/client-api";
import { Empty, Heading, Status } from "./ui";

export function Home({ data }: { data: Bootstrap }) {
  const teacher = data.actor.role === "teacher";
  const published = data.packs.filter((pack) => pack.status === "published");
  const active = data.sessions.find((session) => session.status === "active");
  return (
    <div className="page home-page">
      <Heading
        serif
        title={"Hei, " + data.actor.displayName.split(" ")[0] + "."}
        description={
          teacher
            ? "Hvilket fag skal få en god samtale i dag?"
            : "Hva vil du forstå litt bedre i dag?"
        }
        action={
          teacher ? (
            <Link className="button primary" href="/new">
              <Plus size={17} />
              Ny fagpakke
            </Link>
          ) : undefined
        }
      />
      {active ? (
        <div className="resume-strip">
          <span>
            <span className="live-dot" />
            Du har en økt på pause · <strong>{active.pack.title}</strong>
          </span>
          <Link href={"/practice/" + active.id}>
            Fortsett øvingen
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : null}
      <div className="home-grid">
        <section className="pack-section">
          <div className="section-heading">
            <h2>{teacher ? "Dine fagpakker" : "Klart til øving"}</h2>
            <span className="muted">
              {data.packs.length}{" "}
              {data.packs.length === 1 ? "fagpakke" : "fagpakker"}
            </span>
          </div>
          {data.packs.length ? (
            <div className="pack-list">
              {data.packs.map((pack) => (
                <Link
                  key={pack.id}
                  className="pack-card"
                  href={"/packs/" + pack.id}
                >
                  <div className="pack-card-top">
                    <span className="subject-label">
                      {pack.subject} · {pack.level}
                    </span>
                    <Status published={pack.status === "published"} />
                  </div>
                  <h3>{pack.title}</h3>
                  <p>{pack.description}</p>
                  <div className="pack-card-bottom">
                    <div className="pack-meta">
                      <span>
                        <Clock3 size={14} />
                        {pack.minutes} min
                      </span>
                      <span>
                        <BookOpen size={14} />
                        {pack.goals.length} mål
                      </span>
                      <span>
                        <FileText size={14} />
                        {
                          new Set(pack.sources.map((source) => source.title))
                            .size
                        }{" "}
                        {new Set(pack.sources.map((source) => source.title))
                          .size === 1
                          ? "kilde"
                          : "kilder"}
                      </span>
                    </div>
                    <span className="arrow-circle">
                      <ArrowRight size={18} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title={
                teacher
                  ? "En god samtale starter med godt innhold."
                  : "Det er snart klart for din første fagprat."
              }
              action={
                teacher ? (
                  <Link className="button secondary" href="/new/example">
                    Bruk åpent øvingsmateriale
                    <ArrowRight size={16} />
                  </Link>
                ) : undefined
              }
            >
              {teacher
                ? "Last opp ditt eget materiale, eller prøv et ferdig øvingsnotat om demokrati. Du kontrollerer alt før publisering."
                : "Læreren har ikke publisert en fagpakke til skolen ennå. Når den er klar, finner du den her."}
            </Empty>
          )}
          <div className="section-heading history-heading">
            <h2>{teacher ? "Dine prøveøkter" : "Siste øvinger"}</h2>
            <Link className="text-link" href="/sessions">
              Alle økter
              <ArrowRight size={14} />
            </Link>
          </div>
          {data.sessions.length ? (
            <div className="session-list">
              {data.sessions.slice(0, 3).map((session) => (
                <Link
                  className="session-row"
                  key={session.id}
                  href={
                    (session.status === "completed"
                      ? "/review/"
                      : "/practice/") + session.id
                  }
                >
                  <div>
                    <strong>{session.pack.title}</strong>
                    <span>
                      {session.status === "completed"
                        ? "Avsluttet"
                        : "Påbegynt"}{" "}
                      · {dateLabel(session.startedAt)}
                    </span>
                  </div>
                  <span className="row-goals">
                    {new Set(session.evidence.map((item) => item.goalId)).size}{" "}
                    av {session.pack.goals.length} mål undersøkt
                    <ArrowRight size={15} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="empty-line">
              Ingen økter ennå. Det første forsøket trenger ikke være perfekt.
            </p>
          )}
        </section>
        <aside className="home-aside">
          <section className="how-panel">
            <p className="quiet-label">Fra pensum til egne ord</p>
            <h2>
              Ikke bare vite.{" "}
              <br />
              Kunne forklare.
            </h2>
            <ol className="learning-path">
              <li>
                <span className="path-mark">1</span>
                <div>
                  <strong>
                    {teacher ? "Du setter rammen" : "Læreren setter rammen"}
                  </strong>
                  <p>Fagkilder og mål, valgt av læreren.</p>
                </div>
              </li>
              <li>
                <span className="path-mark">2</span>
                <div>
                  <strong>Eleven får ordet</strong>
                  <p>Spørsmål som følger opp forklaringen.</p>
                </div>
              </li>
              <li>
                <span className="path-mark">3</span>
                <div>
                  <strong>Svaret blir synlig</strong>
                  <p>Egne ord, fagkilder og neste øvelse.</p>
                </div>
              </li>
            </ol>
            <div className="principle-note">
              En gjennomgang av det du viste.
              <br />
              <strong>Ikke en karakter.</strong>
            </div>
          </section>
          <section className="privacy-note">
            <BookOpen size={19} strokeWidth={1.3} />
            <div>
              <h3>
                {published.length
                  ? "Bygget på skolens fagstoff"
                  : "Fagstoffet kommer først"}
              </h3>
              <p>
                KI-treneren bruker den publiserte fagpakken. Du kan åpne kildene
                underveis.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
