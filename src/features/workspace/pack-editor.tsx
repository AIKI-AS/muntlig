"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type { Goal, Pack, PackInput, Rights, Source } from "@/lib/contracts";
import { api, message, post } from "@/lib/client-api";
import { examplePack } from "@/lib/example-pack";
import { LIMITS } from "@/lib/limits";
import { ErrorNotice, Heading } from "./ui";

const empty: PackInput = {
  title: "",
  subject: "",
  level: "VG1",
  description: "",
  minutes: 12,
  goals: [],
  sources: [],
  rights: "unknown",
};
const rightsLabels: Record<Rights, string> = {
  unknown: "Velg rettighetsgrunnlag",
  teacher_owned: "Jeg eier undervisningsmaterialet",
  open_license: "Materialet har åpen lisens",
  publisher_licensed: "Skolen har lisens som tillater denne bruken",
};

export function PackEditor({
  useExample,
  onSaved,
  llm,
}: {
  useExample: boolean;
  onSaved: (pack: Pack) => Promise<void>;
  llm: boolean;
}) {
  const [draft, setDraft] = useState<PackInput>(() =>
    structuredClone(useExample ? examplePack : empty),
  );
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const [sourceTitle, setSourceTitle] = useState(""),
    [sourceText, setSourceText] = useState("");
  const [approved, setApproved] = useState(false);
  function update(patch: Partial<PackInput>) {
    setDraft((current) => ({ ...current, ...patch }));
    setApproved(false);
    setError(null);
  }
  async function upload(file: File) {
    if (file.size > LIMITS.fileBytes) {
      setError(`Filen er for stor (maks ${LIMITS.fileBytes / 1024 / 1024} MB).`);
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ sources: Source[] }>("/api/documents", {
        method: "POST",
        body: form,
      });
      update({ sources: [...draft.sources, ...result.sources] });
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  function addText() {
    if (!sourceTitle.trim() || sourceText.trim().length < 40) {
      setError("Gi kilden en tittel og minst 40 tegn med fagstoff.");
      return;
    }
    if (sourceText.trim().length > LIMITS.sourceText) {
      setError(`Hvert utdrag kan ha opptil ${LIMITS.sourceText} tegn. Del teksten i flere kilder.`);
      return;
    }
    update({
      sources: [
        ...draft.sources,
        {
          id: crypto.randomUUID(),
          title: sourceTitle.trim(),
          page: 1,
          text: sourceText.trim(),
        },
      ],
    });
    setSourceTitle("");
    setSourceText("");
  }
  async function suggest() {
    setBusy("suggest");
    setError(null);
    try {
      const result = await post<{ goals: Goal[]; description: string }>(
        "/api/packs/suggest",
        {
          title: draft.title,
          subject: draft.subject,
          level: draft.level,
          sources: draft.sources,
        },
      );
      update(result);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  function editGoal(index: number, patch: Partial<Goal>) {
    update({
      goals: draft.goals.map((goal, i) =>
        i === index ? { ...goal, ...patch } : goal,
      ),
    });
  }
  function next() {
    if (
      step === 0 &&
      (!draft.title.trim() || !draft.subject.trim() || !draft.sources.length)
    ) {
      setError("Legg til tittel, fag og minst én kilde før du går videre.");
      return;
    }
    if (
      step === 1 &&
      (draft.goals.length !== 3 ||
        draft.goals.some(
          (goal) =>
            !goal.title.trim() || !goal.prompt.trim() || !goal.sourceIds.length,
        ))
    ) {
      setError(
        "Fagpakken trenger tre mål, hvert med et spørsmål og minst én tilknyttet kilde.",
      );
      return;
    }
    setError(null);
    setStep(step + 1);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!approved || draft.rights === "unknown") {
      setError("Kontroller innholdet og avklar rettighetene før du lagrer.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const pack = await post<Pack>("/api/packs", draft);
      await onSaved(pack);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="page editor-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        Fagpakker
      </Link>
      <Heading
        title="Gi fagstoffet en stemme."
        description="Tre steg fra materialet ditt til en fagprat eleven kan øve med."
      />
      <nav className="step-nav" aria-label="Fagpakkens steg">
        {["Innhold", "Mål", "Opplevelse"].map((label, index) => (
          <button
            key={label}
            onClick={() => {
              if (index < step) setStep(index);
            }}
            disabled={index > step || !!busy}
            aria-current={step === index ? "step" : undefined}
          >
            <span>{step > index ? <Check size={14} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <form onSubmit={save} className="editor-grid">
        <section className="editor-main">
          {step === 0 ? (
            <>
              <div className="form-section">
                <div className="section-heading">
                  <h2>Rammen for samtalen</h2>
                  <span className="muted">Steg 1 av 3</span>
                </div>
                <label>
                  Navn på fagpakken
                  <input
                    value={draft.title}
                    onChange={(event) => update({ title: event.target.value })}
                    maxLength={LIMITS.title}
                    placeholder="For eksempel: Demokrati og medborgerskap"
                    required
                  />
                </label>
                <div className="field-row">
                  <label>
                    Fag
                    <input
                      value={draft.subject}
                      onChange={(event) =>
                        update({ subject: event.target.value })
                      }
                      maxLength={LIMITS.subject}
                      placeholder="Samfunnskunnskap"
                      required
                    />
                  </label>
                  <label>
                    Nivå
                    <select
                      value={draft.level}
                      onChange={(event) =>
                        update({ level: event.target.value })
                      }
                    >
                      {[
                        "8. trinn",
                        "9. trinn",
                        "10. trinn",
                        "VG1",
                        "VG2",
                        "VG3",
                      ].map((level) => (
                        <option key={level}>{level}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="form-section">
                <h2>Kildene KI-treneren får bruke</h2>
                <p className="muted">
                  PDF eller ren tekst. Bare materiale skolen har rett til å
                  bruke.
                </p>
                <label className="upload-zone">
                  <Upload size={22} strokeWidth={1.4} />
                  <strong>
                    {busy === "upload"
                      ? "Leser dokumentet …"
                      : "Velg PDF eller tekstfil"}
                  </strong>
                  <span>Opptil {LIMITS.fileBytes / 1024 / 1024} MB · PDF-sidene bevares som kilder</span>
                  <input
                    type="file"
                    accept="application/pdf,text/plain,.pdf,.txt,.md"
                    disabled={!!busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                {draft.sources.length ? (
                  <ul className="source-file-list">
                    {draft.sources.map((source) => (
                      <li key={source.id}>
                        <FileText size={17} />
                        <div>
                          <strong>{source.title}</strong>
                          <span>
                            Side {source.page} ·{" "}
                            {source.text.length.toLocaleString("nb-NO")} tegn
                          </span>
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={
                            "Fjern " + source.title + " side " + source.page
                          }
                          onClick={() =>
                            update({
                              sources: draft.sources.filter(
                                (item) => item.id !== source.id,
                              ),
                              goals: [],
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <details className="text-source">
                  <summary>Eller lim inn egne undervisningsnotater</summary>
                  <label>
                    Kildetittel
                    <input
                      value={sourceTitle}
                      onChange={(event) => setSourceTitle(event.target.value)}
                      maxLength={LIMITS.sourceTitle}
                      placeholder="Mine undervisningsnotater"
                    />
                  </label>
                  <label>
                    Fagstoff
                    <textarea
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      rows={6}
                      maxLength={LIMITS.sourceText}
                      placeholder="Lim inn fagteksten her. Ikke ta med elevopplysninger."
                    />
                  </label>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={addText}
                  >
                    <Plus size={16} />
                    Legg til kilde
                  </button>
                </details>
              </div>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <div className="form-section">
                <div className="section-heading">
                  <h2>Hva skal eleven kunne forklare?</h2>
                  <span className="muted">Steg 2 av 3</span>
                </div>
                <p className="muted">
                  Velg tre presise øvingsmål. De er lærerutvalgte, ikke
                  automatisk godkjente kompetansemål fra Udir.
                </p>
                <button
                  className="button secondary"
                  type="button"
                  onClick={suggest}
                  disabled={!!busy || !llm}
                >
                  <Sparkles size={16} />
                  {busy === "suggest"
                    ? "Leser kildene og foreslår mål …"
                    : "Foreslå mål fra fagstoffet"}
                </button>
                {!llm ? (
                  <p className="fine-print">
                    KI-forslag er ikke aktivert. Du kan skrive målene selv.
                  </p>
                ) : null}
              </div>
              {draft.goals.map((goal, index) => (
                <div key={goal.id} className="goal-editor">
                  <div className="section-heading">
                    <h3>Mål {index + 1}</h3>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={"Fjern mål " + (index + 1)}
                      onClick={() =>
                        update({
                          goals: draft.goals.filter(
                            (item) => item.id !== goal.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label>
                    Eleven skal kunne
                    <input
                      value={goal.title}
                      onChange={(event) =>
                        editGoal(index, { title: event.target.value })
                      }
                      maxLength={LIMITS.goalTitle}
                      required
                    />
                  </label>
                  <label>
                    Et spørsmål som åpner målet
                    <textarea
                      rows={2}
                      value={goal.prompt}
                      onChange={(event) =>
                        editGoal(index, { prompt: event.target.value })
                      }
                      maxLength={LIMITS.goalPrompt}
                      required
                    />
                  </label>
                  <fieldset className="source-choices">
                    <legend>Kilder til dette målet</legend>
                    {draft.sources.map((source) => (
                      <label key={source.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={goal.sourceIds.includes(source.id)}
                          onChange={(event) =>
                            editGoal(index, {
                              sourceIds: event.target.checked
                                ? [...goal.sourceIds, source.id]
                                : goal.sourceIds.filter(
                                    (id) => id !== source.id,
                                  ),
                            })
                          }
                        />
                        <span>
                          {source.title} · s. {source.page}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              ))}
              {draft.goals.length < 3 ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    update({
                      goals: [
                        ...draft.goals,
                        {
                          id: crypto.randomUUID(),
                          title: "",
                          prompt: "",
                          sourceIds: draft.sources.map((source) => source.id),
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Skriv mål {draft.goals.length + 1}
                </button>
              ) : null}
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div className="form-section">
                <div className="section-heading">
                  <h2>En trygg ramme for å prøve</h2>
                  <span className="muted">Steg 3 av 3</span>
                </div>
                <label>
                  Kort introduksjon
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      update({ description: event.target.value })
                    }
                    rows={3}
                    maxLength={LIMITS.description}
                    placeholder="Hva skal eleven øve på i denne fagpraten?"
                    required
                  />
                </label>
                <div className="field-row">
                  <label>
                    Planlagt øvingstid
                    <select
                      value={draft.minutes}
                      onChange={(event) =>
                        update({ minutes: Number(event.target.value) })
                      }
                    >
                      {[5, 8, 10, 12, 15, 20].map((minutes) => (
                        <option value={minutes} key={minutes}>
                          {minutes} minutter
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rettigheter til kildematerialet
                    <select
                      value={draft.rights}
                      onChange={(event) =>
                        update({ rights: event.target.value as Rights })
                      }
                    >
                      {Object.entries(rightsLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="approval-panel">
                <h3>Læreren har siste ord</h3>
                <p>
                  Kontroller mål, spørsmål, fagstoff og rettigheter. KI-en
                  setter aldri karakter, og kan ta feil.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(event) => setApproved(event.target.checked)}
                  />
                  <span>
                    Jeg har kontrollert innholdet og har rett til å bruke
                    kildene i denne fagpakken.
                  </span>
                </label>
              </div>
            </>
          ) : null}
          {error ? <ErrorNotice>{error}</ErrorNotice> : null}
          <div className="editor-actions">
            {step > 0 ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(step - 1)}
                disabled={!!busy}
              >
                <ArrowLeft size={16} />
                Tilbake
              </button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <button
                type="button"
                className="button primary"
                onClick={next}
                disabled={!!busy}
              >
                Neste
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="button primary"
                disabled={!!busy || !approved || draft.rights === "unknown"}
              >
                {busy === "save"
                  ? "Lagrer fagpakken …"
                  : "Lagre og forhåndsvis"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
        <aside className="editor-preview">
          <p className="quiet-label">Dette blir elevens ramme</p>
          <h2>{draft.title || "Din neste fagpakke"}</h2>
          <p>
            {draft.subject || "Velg fag"} · {draft.level} · {draft.minutes} min
          </p>
          <div className="preview-rule" />
          <span className="quiet-label">Øvingsmål</span>
          {draft.goals.length ? (
            <ol className="preview-goals">
              {draft.goals.map((goal) => (
                <li key={goal.id}>{goal.title || "Et nytt mål"}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">Målene du velger i neste steg, kommer her.</p>
          )}
          <p className="preview-footnote">
            Eleven møter en trener som spør og følger opp. Ikke en chatbot som
            gjør arbeidet.
          </p>
          {useExample ? (
            <p className="fine-print">
              Åpent eksempel: egenutviklet øvingsnotat (CC0). Ingen elevdata.
            </p>
          ) : null}
        </aside>
      </form>
    </div>
  );
}
