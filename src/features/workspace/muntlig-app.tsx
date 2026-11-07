"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  BookOpen,
  ChevronRight,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  Bootstrap,
  Pack,
  Review as ReviewData,
  Session,
} from "@/lib/contracts";
import { api, ApiError, message, post } from "@/lib/client-api";
import { Home } from "./home";
import { History } from "./history";
import { Login } from "./login";
import { PackEditor } from "./pack-editor";
import { PackDetail } from "./pack-detail";
import { Practice } from "./practice";
import { Privacy } from "./privacy";
import { Review } from "./review";
import { ErrorNotice, Mark } from "./ui";

export function MuntligApp({
  initialData,
  initialError,
}: {
  initialData: Bootstrap | null;
  initialError: string | null;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [data, setData] = useState<Bootstrap | null>(initialData),
    [setupError, setSetupError] = useState<string | null>(initialError),
    [navOpen, setNavOpen] = useState(false),
    [globalError, setGlobalError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Bootstrap>("/api/bootstrap");
      setData(next);
      setSetupError(null);
    } catch (error) {
      setData(null);
      setSetupError(
        error instanceof ApiError && error.status === 401
          ? null
          : message(error),
      );
    }
  }, []);
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("main h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);
  async function logout() {
    try {
      await post("/api/auth/sign-out");
      setData(null);
      router.push("/");
    } catch (error) {
      setGlobalError(message(error));
    }
  }
  async function saved(pack: Pack) {
    await refresh();
    router.push("/packs/" + pack.id);
  }
  async function started(session: Session) {
    await refresh();
    router.push("/practice/" + session.id);
  }
  async function finished(review: ReviewData) {
    await refresh();
    router.push("/review/" + review.session.id);
  }
  if (!data) return <Login onLogin={refresh} setupError={setupError} />;
  const parts = pathname.split("/").filter(Boolean),
    teacher = data.actor.role === "teacher";
  const pack =
    parts[0] === "packs"
      ? data.packs.find((pack) => pack.id === parts[1])
      : null;
  let content;
  if (!parts.length) content = <Home data={data} />;
  else if (parts[0] === "new" && teacher)
    content = (
      <PackEditor
        key={pathname}
        useExample={parts[1] === "example"}
        onSaved={saved}
        llm={data.integrations.llm}
      />
    );
  else if (parts[0] === "packs" && pack)
    content = (
      <PackDetail
        key={pack.id}
        pack={pack}
        teacher={teacher}
        integrations={data.integrations}
        onPublish={async () => {
          await refresh();
        }}
        onStart={started}
      />
    );
  else if (parts[0] === "practice" && parts[1])
    content = <Practice key={parts[1]} id={parts[1]} onFinish={finished} />;
  else if (parts[0] === "review" && parts[1])
    content = <Review key={parts[1]} id={parts[1]} />;
  else if (parts[0] === "sessions")
    content = <History sessions={data.sessions} />;
  else if (parts[0] === "privacy") content = <Privacy />;
  else
    content = (
      <div className="page">
        <h1>Vi finner ikke denne siden.</h1>
        <p>Fagpakken eller økten kan være utilgjengelig for kontoen din.</p>
        <Link href="/" className="button secondary">
          Til arbeidsrommet
        </Link>
      </div>
    );
  return (
    <div
      className={"app-shell" + (navOpen ? " nav-open" : "")}
      data-ui="muntlig"
    >
      <a href="#main-content" className="skip-link">
        Hopp til innholdet
      </a>
      <header className="mobile-header">
        <Mark small />
        <button
          className="icon-button"
          onClick={() => setNavOpen(!navOpen)}
          aria-label={navOpen ? "Lukk meny" : "Åpne meny"}
          aria-expanded={navOpen}
          aria-controls="app-navigation"
        >
          {navOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>
      <aside className="sidebar" id="app-navigation">
        <div className="sidebar-brand">
          <Mark />
        </div>
        <nav aria-label="Hovedmeny">
          <Link
            href="/"
            onClick={() => setNavOpen(false)}
            aria-current={
              !parts.length || parts[0] === "packs" ? "page" : undefined
            }
          >
            <BookOpen size={18} />
            <span>Arbeidsrom</span>
          </Link>
          <Link
            href="/sessions"
            onClick={() => setNavOpen(false)}
            aria-current={parts[0] === "sessions" ? "page" : undefined}
          >
            <AudioLines size={18} />
            <span>Mine økter</span>
          </Link>
          {teacher ? (
            <Link
              href="/new"
              onClick={() => setNavOpen(false)}
              aria-current={parts[0] === "new" ? "page" : undefined}
            >
              <Plus size={18} />
              <span>Ny fagpakke</span>
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/privacy"
            onClick={() => setNavOpen(false)}
            className="privacy-link"
          >
            <ShieldCheck size={16} />
            <span>Trygg øving</span>
            <ChevronRight size={14} />
          </Link>
          <div className="account-row">
            <span className="user-initial">
              {data.actor.displayName.slice(0, 1)}
            </span>
            <div>
              <strong>{data.actor.displayName}</strong>
              <span>{teacher ? "Lærerkonto" : "Elevkonto"}</span>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Logg ut"
              title="Logg ut"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {navOpen ? (
        <button
          className="nav-scrim"
          aria-label="Lukk meny"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <main id="main-content" className="app-sheet">
        {globalError ? <ErrorNotice>{globalError}</ErrorNotice> : null}
        {content}
      </main>
    </div>
  );
}
