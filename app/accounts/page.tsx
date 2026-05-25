import { PageShell } from "@/components/page-shell";

const accountTypes = ["Bank", "Credit card", "Investment", "Crypto", "Debt", "Manual"];

export default function AccountsPage() {
  return (
    <PageShell
      eyebrow="Sources"
      title="Accounts"
      description="Placeholder for financial accounts that will own uploaded files, import batches, and normalized transactions."
    >
      <section className="rounded-lg border border-line bg-white">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-3 lg:grid-cols-6">
          {accountTypes.map((type) => (
            <div className="bg-white p-5" key={type}>
              <p className="text-sm font-semibold text-ink">{type}</p>
              <p className="mt-2 text-sm text-slate-500">Not configured</p>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
