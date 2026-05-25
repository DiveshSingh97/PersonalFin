import { PageShell } from "@/components/page-shell";
import { createAccountAction } from "@/lib/imports/actions";
import { loadAccounts } from "@/lib/db/server";

export const dynamic = "force-dynamic";

const accountTypes = [
  ["bank", "Bank"],
  ["credit_card", "Credit card"],
  ["investment", "Investment"],
  ["crypto", "Crypto"],
  ["debt", "Debt"],
  ["manual", "Manual"]
] as const;

export default async function AccountsPage() {
  const pageData = await loadAccounts();

  return (
    <PageShell
      eyebrow="Sources"
      title="Accounts"
      description="Create and manage the financial accounts that own uploaded files, import batches, and normalized transactions."
    >
      {pageData.status === "unauthenticated" ? (
        <SetupNotice message="Sign in with Supabase Auth to view and create accounts." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <form action={createAccountAction} className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-base font-semibold text-ink">Create account</h2>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-cyan-600"
                  name="name"
                  placeholder="Everyday checking"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Provider name
                <input
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-cyan-600"
                  name="provider_name"
                  placeholder="Bank or platform"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Account type
                <select
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-cyan-600"
                  name="account_type"
                  defaultValue="bank"
                >
                  {accountTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Currency
                <input
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm uppercase text-ink outline-none focus:border-cyan-600"
                  name="currency"
                  defaultValue="ZAR"
                  maxLength={3}
                  minLength={3}
                  required
                />
              </label>
              <button className="w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                Create account
              </button>
            </div>
          </form>

          <section className="overflow-x-auto rounded-lg border border-line bg-white">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_0.7fr] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div className="px-4 py-3">Account</div>
                <div className="px-4 py-3">Provider</div>
                <div className="px-4 py-3">Type</div>
                <div className="px-4 py-3">Currency</div>
                <div className="px-4 py-3">Status</div>
              </div>
              {pageData.data.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No accounts yet.
                </div>
              ) : (
                pageData.data.map((account) => (
                  <div
                    className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_0.7fr] border-b border-line text-sm last:border-b-0"
                    key={account.id}
                  >
                    <div className="px-4 py-3 font-medium text-ink">{account.name}</div>
                    <div className="px-4 py-3 text-slate-600">
                      {account.institution_name || "Unspecified"}
                    </div>
                    <div className="px-4 py-3 text-slate-600">
                      {account.account_type.replace("_", " ")}
                    </div>
                    <div className="px-4 py-3 text-slate-600">{account.currency}</div>
                    <div className="px-4 py-3 text-slate-600">
                      {account.is_active ? "Active" : "Inactive"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
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
