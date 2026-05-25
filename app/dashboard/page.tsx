import { PageShell } from "@/components/page-shell";

const metrics = [
  "Net worth",
  "Cash balance",
  "Monthly income",
  "Monthly expenses",
  "Savings rate",
  "Upcoming payments"
];

export default function DashboardPage() {
  return (
    <PageShell
      eyebrow="Overview"
      title="Dashboard"
      description="Placeholder for monthly cash flow, balances, category breakdowns, and planning summaries once ingestion is connected."
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <article className="rounded-lg border border-line bg-white p-5" key={metric}>
            <p className="text-sm font-medium text-slate-500">{metric}</p>
            <p className="mt-4 text-2xl font-semibold text-ink">Pending data</p>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
