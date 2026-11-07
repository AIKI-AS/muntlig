"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { message, post } from "@/lib/client-api";
import { ErrorNotice, Mark } from "./ui";
import { ProductScene } from "./product-scene";

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
        <ProductScene />
      </div>
      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <p className="quiet-label">Arbeidsrommet ditt</p>
          <h1>Klart for en fagprat?</h1>
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
        <span className="auth-bottom">Muntlig fagtrening. Uten karakterpress.</span>
      </section>
    </main>
  );
}
