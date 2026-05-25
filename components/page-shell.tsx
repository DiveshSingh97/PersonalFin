import type { ReactNode } from "react";

type PageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function PageShell({ eyebrow, title, description, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <section className="pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
          {eyebrow}
        </p>
        <div className="mt-3 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
        </div>
      </section>
      {children}
    </div>
  );
}
