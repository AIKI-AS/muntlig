"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  AudioLines,
  FileText,
  MessageSquare,
  Pause,
  Play,
  Video,
} from "lucide-react";
import { evidenceLabels, type Integrations, type Pack, type Session } from "@/lib/contracts";
import { goalStates, type GoalState } from "./activity-visual";

const stateWord = (state: GoalState) =>
  evidenceLabels[state === "open" ? "not_explored" : state].toLowerCase();
const modeWord = { text: "tekst", voice: "tale", avatar: "avatar" } as const;
export const plural = (n: number, one: string, many: string) =>
  n === 1 ? one : many;

/** Three bars like the brand mark, one per goal; fill shows the evidence found in a real session. */
export function GoalBars({ states }: { states: GoalState[] }) {
  return (
    <span
      className="dash-goalmark"
      role="img"
      aria-label={
        "Mål: " + states.map((state) => stateWord(state)).join(", ")
      }
    >
      {states.map((state, i) => (
        <i key={i} data-state={state} />
      ))}
    </span>
  );
}

/** One goal as a small acoustic cluster. Only the goal currently in conversation may breathe. */
export function GoalWave({
  state,
  current = false,
}: {
  state: GoalState;
  current?: boolean;
}) {
  return (
    <span
      className="dash-wave"
      data-state={state}
      data-current={current || undefined}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((bar) => (
        <i key={bar} style={{ "--b": bar } as CSSProperties} />
      ))}
    </span>
  );
}

function Cues({ pack, integrations }: { pack: Pack; integrations: Integrations }) {
  const documents = new Set(pack.sources.map((source) => source.title)).size;
  const modes = [
    { label: "Tekst", icon: MessageSquare, on: integrations.llm },
    { label: "Tale", icon: AudioLines, on: integrations.voice },
    {
      label: "Avatar",
      icon: Video,
      on: integrations.avatar,
    },
  ];
  return (
    <div className="dash-cues">
      <p>
        <FileText size={15} aria-hidden="true" />
        {pack.sources.length} kildeutdrag fra{" "}
        {documents} {plural(documents, "dokument", "dokumenter")}
      </p>
      <ul aria-label="Samtaleformer i dette arbeidsrommet">
        {modes.map(({ label, icon: Icon, on }) => (
          <li key={label} data-on={on}>
            <Icon size={15} aria-hidden="true" />
            {label}
            {on ? null : <span> · ikke aktivert</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Focus({
  session,
  pack,
  teacher,
  integrations,
}: {
  session: Session | null;
  pack: Pack;
  teacher: boolean;
  integrations: Integrations;
}) {
  const [calm, setCalm] = useState(false);
  const states = session ? goalStates(session) : null;
  const draft = pack.status === "draft";
  const userTurns = session
    ? session.turns.filter((turn) => turn.role === "user").length
    : 0;
  return (
    <section
      className="dash-focus dash-rise"
      data-calm={calm}
      aria-labelledby="dash-focus-title"
    >
      <div className="dash-focus-top">
        <p className="dash-kicker">
          {session
            ? "Pågående økt"
            : draft
              ? "Utkast som venter på deg"
              : teacher
                ? "Klar for prøveøkt"
                : "Neste fagpakke"}
        </p>
        {session ? (
          <button
            type="button"
            className="dash-motion"
            aria-pressed={calm}
            aria-label={calm ? "Start bevegelsen i målene" : "Pause bevegelsen i målene"}
            title={calm ? "Bevegelsen er på pause" : "Pause bevegelsen"}
            onClick={() => setCalm(!calm)}
          >
            <span className="dash-morph" data-paused={calm}>
              <Pause size={18} aria-hidden="true" />
              <Play size={18} aria-hidden="true" />
            </span>
          </button>
        ) : null}
      </div>
      <h2 id="dash-focus-title">{pack.title}</h2>
      <p className="dash-focus-meta">
        {pack.subject} · {pack.level} · {pack.minutes} min
      </p>
      <ol className="dash-goals" aria-label="Målene i fagpakken">
        {pack.goals.map((goal, i) => {
          const state = states?.[i] ?? "open";
          const current = !!session && state === "open" && goal.id === session.activeGoalId;
          return (
            <li key={goal.id}>
              <GoalWave state={state} current={current} />
              <div className="dash-goal-text">
                <strong>{goal.title}</strong>
                <span>
                  {session
                    ? state !== "open"
                      ? evidenceLabels[state]
                      : current
                        ? "I samtalen nå"
                        : "Ikke undersøkt ennå"
                    : "Mål " + (i + 1)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="dash-focus-actions">
        <Link
          className="button primary"
          href={session ? "/practice/" + session.id : "/packs/" + pack.id}
        >
          {session ? "Fortsett øvingen" : draft ? "Åpne utkastet" : "Åpne fagpakken"}
          <ArrowRight size={16} className="morph-arrow" aria-hidden="true" />
        </Link>
        <p>
          {session
            ? userTurns + " svar fra deg · " + modeWord[session.mode]
            : draft
              ? "Gjennomgå og publiser fra fagpakken."
              : "Der velger du avatar, tale eller tekst og starter."}
        </p>
      </div>
      <Cues pack={pack} integrations={integrations} />
    </section>
  );
}

