"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  ChevronRight,
  LogOut,
  Menu,
  Mic,
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
import { OralSetup } from "./oral-setup";
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
    router = useRouter(),
    search = useSearchParams();
  const [data, setData] = useState<Bootstrap | null>(initialData),
    [setupError, setSetupError] = useState<string | null>(initialError),
    [navOpen, setNavOpen] = useState(false),
    [globalError, setGlobalError] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const loggedIn = data !== null;
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
    const main = mainRef.current;
    if (!loggedIn || !main) return;
    const focusHeading = (heading: HTMLElement) => {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    };
    const heading = main.querySelector<HTMLElement>("h1");
    if (heading) {
      focusHeading(heading);
    } else {
      main.focus({ preventScroll: true });
    }
    const observer = new MutationObserver(() => {
      const ready = main.querySelector<HTMLElement>("h1");
      if (ready && document.activeElement === main) focusHeading(ready);
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, loggedIn]);
  useEffect(() => {
    const panel = sidebar.current;
    const toggle = menuButton.current;
    if (!navOpen || !panel || !toggle) return;
    const media = window.matchMedia("(max-width: 1000px)");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.querySelector<HTMLElement>("a[href]")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavOpen(false);
      } else if (event.key === "Tab") {
        const controls = [toggle, ...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === toggle) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          toggle.focus();
        }
      }
    };
    const resize = () => { if (!media.matches) setNavOpen(false); };
    document.addEventListener("keydown", keydown);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", keydown);
      media.removeEventListener("change", resize);
      document.body.style.overflow = previousOverflow;
      if (media.matches) toggle.focus({ preventScroll: true });
    };
  }, [navOpen]);
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
    if (window.location.pathname === pathname) router.push("/packs/" + pack.id);
  }
  async function started(session: Session) {
    router.push("/practice/" + session.id);
    await refresh();
  }
  async function finished(review: ReviewData) {
    router.push("/review/" + review.session.id);
    await refresh();
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
  else if (parts[0] === "muntlig")
    content = <OralSetup key={search.get("pack") ?? "all"} packs={data.packs} selectedId={search.get("pack")} integrations={data.integrations} onStart={started} />;
  else if (parts[0] === "practice" && parts[1])
    content = <Practice key={parts[1]} id={parts[1]} onFinish={finished} />;
  else if (parts[0] === "review" && parts[1])
    content = <Review key={parts[1]} id={parts[1]} />;
  else if (parts[0] === "sessions")
    content = <History sessions={data.sessions} student={!teacher} />;
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
      <a href="#main-content" className="skip-link" tabIndex={navOpen ? -1 : undefined}>
        Hopp til innholdet
      </a>
      <header className="mobile-header">
        <Mark small />
        <button
          ref={menuButton}
          className="icon-button"
          onClick={() => setNavOpen(!navOpen)}
          aria-label={navOpen ? "Lukk meny" : "Åpne meny"}
          aria-expanded={navOpen}
          aria-controls="app-navigation"
        >
          {navOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>
      <aside ref={sidebar} className="sidebar" id="app-navigation">
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
          <Link
            href="/muntlig"
            onClick={() => setNavOpen(false)}
            aria-current={parts[0] === "muntlig" || parts[0] === "practice" ? "page" : undefined}
          >
            <Mic size={18} />
            <span>Muntlig</span>
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
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <main ref={mainRef} id="main-content" className="app-sheet" tabIndex={-1} inert={navOpen}>
        {globalError ? <ErrorNotice>{globalError}</ErrorNotice> : null}
        {content}
      </main>
    </div>
  );
}
