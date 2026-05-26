import type { ReactNode } from "react";
import { clsx } from "clsx";

const statusStyles: Record<string, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  committed: "border-cyan-200 bg-cyan-50 text-cyan-800",
  duplicate: "border-amber-200 bg-amber-50 text-amber-800",
  invalid: "border-rose-200 bg-rose-50 text-rose-800",
  skipped: "border-slate-200 bg-slate-100 text-slate-700",
  needs_review: "border-violet-200 bg-violet-50 text-violet-800",
  reviewing: "border-cyan-200 bg-cyan-50 text-cyan-800",
  undone: "border-slate-200 bg-slate-100 text-slate-700",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
  income: "border-emerald-200 bg-emerald-50 text-emerald-800",
  expense: "border-rose-200 bg-rose-50 text-rose-800",
  transfer: "border-slate-200 bg-slate-100 text-slate-700",
  subscription: "border-indigo-200 bg-indigo-50 text-indigo-800"
};

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-lg border border-line bg-white shadow-sm", className)}>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
        statusStyles[status] ?? "border-slate-200 bg-slate-50 text-slate-700"
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SetupNotice({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      {message}
    </section>
  );
}

export const fieldClassName =
  "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export const primaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-md bg-cyan-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:bg-slate-300";

export const secondaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400";
