import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Session } from "@/lib/contracts";
import { dateLabel } from "@/lib/client-api";
import { Empty, Heading } from "./ui";
export function History({ sessions }: { sessions: Session[] }) {
  return (
    <div className="page">
      <Heading
        title="Dine egne fagprater."
        description="Se hva du undersøkte, eller ta opp tråden der du slapp."
      />
      {sessions.length ? (
        <section className="all-sessions">
          <div className="section-heading">
            <h2>Økthistorikk</h2>
            <span className="muted">
              {sessions.length} {sessions.length === 1 ? "økt" : "økter"}
            </span>
          </div>
          {sessions.map((session) => (
            <Link
              className="session-row"
              href={
                (session.status === "completed" ? "/review/" : "/practice/") +
                session.id
              }
              key={session.id}
            >
              <div>
                <strong>{session.pack.title}</strong>
                <span>
                  {session.pack.subject} · {dateLabel(session.startedAt)} ·{" "}
                  {session.status === "completed" ? "Avsluttet" : "Påbegynt"}
                </span>
              </div>
              <span className="row-goals">
                {new Set(session.evidence.map((item) => item.goalId)).size} av{" "}
                {session.pack.goals.length} mål undersøkt
                <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <Empty
          title="Din første fagprat ligger foran deg."
          action={
            <Link className="button secondary" href="/">
              Finn en fagpakke
              <ArrowRight size={16} />
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
