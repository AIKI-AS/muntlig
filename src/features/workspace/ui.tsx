"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  FileText,
  X,
} from "lucide-react";
import type { Source } from "@/lib/contracts";

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "brand small-brand" : "brand"}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <path
          d="M6 8.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-7l-6 4v-5a3 3 0 0 1-2-2.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M11 12v4m4-7v10m4-7v4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <span>
        Muntlig<span className="brand-period" aria-hidden="true">.</span>
      </span>
    </span>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice error-notice" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
export function Status({ published }: { published: boolean }) {
  return (
    <span className={published ? "status published" : "status"}>
      {published ? <Check size={12} aria-hidden="true" /> : null}
      {published ? "Publisert" : "Utkast"}
    </span>
  );
}
export function Loading({
  label = "Henter arbeidsrommet …",
  layout = "workspace",
}: {
  label?: string;
  layout?: "workspace" | "practice" | "review" | "history";
}) {
  return (
    <div className="loading-state" role="status" aria-busy="true">
      <p>{label}</p>
      <div className="loading-skeleton" data-layout={layout} aria-hidden="true">
        <span className="skeleton skeleton-title" />
        <div className="skeleton-grid">
          {Array.from({ length: layout === "history" || layout === "practice" ? 3 : 2 }, (_, index) => (
            <div className="skeleton-panel" key={index}>
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-block" />
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
export function Heading({
  title,
  description,
  action,
  serif = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  serif?: boolean;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1 className={serif ? "greeting" : ""}>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Lukk">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SourceDialog({
  source,
  onClose,
}: {
  source: Source | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={source !== null}
      title="Kilden bak samtalen"
      onClose={onClose}
    >
      {source ? (
        <>
          <p className="document-label">
            <FileText size={16} />
            {source.title} · side {source.page}
          </p>
          <div className="source-paper">
            <p>{source.text}</p>
          </div>
          <p className="fine-print">
            Dette er kildeteksten fra fagpakkeversjonen økten bruker. KI-svar
            kan fortsatt inneholde feil.
          </p>
        </>
      ) : null}
    </Dialog>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </button>
  );
}
