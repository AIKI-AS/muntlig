"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Check, ShieldCheck } from "lucide-react";
import { message, post } from "@/lib/client-api";
import { ErrorNotice, Mark } from "./ui";

export function Login({
  onLogin,
  setupError,
}: {
  onLogin: () => Promise<void>;
  setupError: string | null;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const fields = new FormData(event.currentTarget);
    try {
      await post("/api/auth/sign-in", {
        email: fields.get("email"),
        password: fields.get("password"),
      });
      await onLogin();
    } catch (error) {
      setError(message(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-story">
        <Mark />
        <div className="auth-headline">
          <p className="quiet-label">Skolens egen muntlige trener</p>
          <h1>
            Fra pensum
            <br />
            til egne ord.
          </h1>
          <p>
            Det er én ting å kjenne igjen svaret.
            <br />
            En annen å forklare det selv.
          </p>
        </div>
        <div className="auth-example" aria-label="Slik foregår øvingen">
          <div className="example-question">
            <BookOpen size={18} />
            <span>Et spørsmål som åpner faget</span>
          </div>
          <p>
            «Hvorfor deler vi statsmakten{" "}
            <br />
            mellom flere institusjoner?»
          </p>
          <div className="example-goals">
            <span>
              <Check size={14} />
              Dine egne forklaringer
            </span>
            <span>
              <Check size={14} />
              Lærerens fagkilder
            </span>
          </div>
        </div>
        <p className="auth-footer">
          Lærerstyrt innhold. Kilder hele veien. Ingen karakter.
        </p>
      </div>
      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <p className="quiet-label">Arbeidsrommet ditt</p>
          <h2>Klart for en fagprat?</h2>
          <p className="muted">
            Logg inn med kontoen skolen har opprettet for deg.
          </p>
          {setupError ? (
            <ErrorNotice>
              {setupError} Tilkoblingen må settes opp før innlogging.
            </ErrorNotice>
          ) : null}
          <form onSubmit={submit}>
            <label>
              E-post
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="navn@skolen.no"
                disabled={pending}
              />
            </label>
            <label>
              Passord
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                disabled={pending}
              />
            </label>
            {error ? <ErrorNotice>{error}</ErrorNotice> : null}
            <button
              className="button primary wide"
              type="submit"
              disabled={pending || !!setupError}
            >
              {pending ? "Logger inn …" : "Logg inn"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-privacy">
            <ShieldCheck size={17} />
            <p>
              Vi lagrer ikke rålyd eller avatarvideo. Skriv aldri sensitive
              personopplysninger i en økt.
            </p>
          </div>
          <details className="access-help">
            <summary>Mangler du tilgang?</summary>
            <p>
              Be læreren eller skolens administrator om en konto. Feide er ikke
              aktivert i denne versjonen.
            </p>
          </details>
        </div>
        <span className="auth-bottom">Et rolig sted å øve. I ditt tempo.</span>
      </section>
    </main>
  );
}
