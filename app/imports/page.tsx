import { CheckCircle2, CircleDashed, RotateCcw } from "lucide-react";
import { PageShell } from "@/components/page-shell";

const stages = [
  {
    title: "Staged",
    description: "Parsed rows wait for mapping and validation.",
    icon: CircleDashed
  },
  {
    title: "Confirmed",
    description: "Clean rows are committed to normalized transactions.",
    icon: CheckCircle2
  },
  {
    title: "Undoable",
    description: "Each import batch will be reversible by design.",
    icon: RotateCcw
  }
];

export default function ImportsPage() {
  return (
    <PageShell
      eyebrow="Import batches"
      title="Imports"
      description="Placeholder for import review, duplicate checks, batch status, and undo controls."
    >
      <section className="grid gap-4 md:grid-cols-3">
        {stages.map((stage) => (
          <article className="rounded-lg border border-line bg-white p-5" key={stage.title}>
            <stage.icon className="h-5 w-5 text-amber-700" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-ink">{stage.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{stage.description}</p>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
