import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/auth-notice";
import {
  Card,
  EmptyState,
  SetupNotice,
  fieldClassName,
  primaryButtonClassName
} from "@/components/ui";
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
        <AuthNotice message="Sign in with Supabase Auth to view and create accounts." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card className="p-5">
            <form action={createAccountAction}>
              <h2 className="text-base font-semibold text-ink">Create account</h2>
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Name
                  <input
                    className={fieldClassName}
                    name="name"
                    placeholder="Everyday checking"
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Provider name
                  <input
                    className={fieldClassName}
                    name="provider_name"
                    placeholder="Bank or platform"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Account type
                  <select
                    className={fieldClassName}
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
                    className={fieldClassName}
                    name="currency"
                    defaultValue="ZAR"
                    maxLength={3}
                    minLength={3}
                    required
                  />
                </label>
                <button className={`${primaryButtonClassName} w-full`}>
                  Create account
                </button>
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <section className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_0.7fr] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div className="px-4 py-3">Account</div>
                  <div className="px-4 py-3">Provider</div>
                  <div className="px-4 py-3">Type</div>
                  <div className="px-4 py-3">Currency</div>
                  <div className="px-4 py-3">Status</div>
                </div>
                {pageData.data.length === 0 ? (
                  <EmptyState
                    title="No accounts yet"
                    description="Create the first account to start uploading and staging exports."
                  />
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
                      <div className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          {account.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
