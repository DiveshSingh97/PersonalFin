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
      <section className="border-b border-line pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">
          {eyebrow}
        </p>
        <div className="mt-3 max-w-3xl">
          <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">{description}</p>
        </div>
      </section>
      {children}
    </div>
  );
}
