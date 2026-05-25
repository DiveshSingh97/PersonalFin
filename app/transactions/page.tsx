import { PageShell } from "@/components/page-shell";

const columns = ["Date", "Account", "Merchant", "Category", "Amount", "Status"];

export default function TransactionsPage() {
  return (
    <PageShell
      eyebrow="Normalized records"
      title="Transactions"
      description="Placeholder for reviewed transactions after import mapping, duplicate detection, and user confirmation."
    >
      <section className="overflow-x-auto rounded-lg border border-line bg-white">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-6 border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {columns.map((column) => (
              <div className="px-4 py-3" key={column}>
                {column}
              </div>
            ))}
          </div>
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No transactions imported yet.
          </div>
        </div>
      </section>
    </PageShell>
  );
}
