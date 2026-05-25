import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/auth-notice";
import { loadTransactions } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const pageData = await loadTransactions();

  return (
    <PageShell
      eyebrow="Normalized records"
      title="Transactions"
      description="View normalized transactions that were confirmed from import batches."
    >
      {pageData.status === "unauthenticated" ? (
        <AuthNotice message="Sign in with Supabase Auth to view transactions." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-white">
          <div className="min-w-[940px]">
            <div className="grid grid-cols-[0.9fr_1fr_2fr_0.9fr_0.8fr_0.8fr_0.8fr] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="px-4 py-3">Date</div>
              <div className="px-4 py-3">Account</div>
              <div className="px-4 py-3">Description</div>
              <div className="px-4 py-3">Amount</div>
              <div className="px-4 py-3">Direction</div>
              <div className="px-4 py-3">Category</div>
              <div className="px-4 py-3">Import</div>
            </div>
            {pageData.data.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                No transactions imported yet.
              </div>
            ) : (
              pageData.data.map((transaction) => (
                <div
                  className="grid grid-cols-[0.9fr_1fr_2fr_0.9fr_0.8fr_0.8fr_0.8fr] border-b border-line text-sm last:border-b-0"
                  key={transaction.id}
                >
                  <div className="px-4 py-3 text-slate-600">
                    {formatDate(transaction.transaction_date)}
                  </div>
                  <div className="px-4 py-3 text-slate-600">
                    {transaction.financial_accounts?.name || "Unknown"}
                  </div>
                  <div className="px-4 py-3 font-medium text-ink">
                    {transaction.description_raw}
                  </div>
                  <div className="px-4 py-3 text-slate-600">
                    {formatMoney(transaction.amount, transaction.currency)}
                  </div>
                  <div className="px-4 py-3 text-slate-600">{transaction.direction}</div>
                  <div className="px-4 py-3 text-slate-600">
                    {transaction.transaction_categories?.name || "Uncategorized"}
                  </div>
                  <div className="px-4 py-3 text-slate-600">
                    {transaction.import_batches?.id.slice(0, 8) || "Manual"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </PageShell>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      {message}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    currency,
    style: "currency"
  }).format(amount);
}
