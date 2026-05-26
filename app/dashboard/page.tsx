import Link from "next/link";
import { Search } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/auth-notice";
import {
  Card,
  EmptyState,
  SetupNotice,
  StatusBadge,
  fieldClassName,
  primaryButtonClassName,
  secondaryButtonClassName
} from "@/components/ui";
import { loadDashboardPageData, type DashboardFilters } from "@/lib/dashboard/server";
import { formatDate, formatInteger, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const filters = readFilters(params);
  const pageData = await loadDashboardPageData(filters);

  return (
    <PageShell
      eyebrow="Overview"
      title="Dashboard"
      description="Summaries from committed, active transactions. Staged rows and undone imports stay out of these numbers."
    >
      {pageData.status === "unauthenticated" ? (
        <AuthNotice message="Sign in with Supabase Auth to view dashboard summaries." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : !pageData.data.hasAnyTransactions ? (
        <EmptyDashboard accountsCount={pageData.data.accounts.length} />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <form className="grid gap-4 md:grid-cols-[220px_1fr_auto]">
              <label className="block text-sm font-medium text-slate-700">
                Month
                <input
                  className={fieldClassName}
                  defaultValue={pageData.data.filters.month}
                  name="month"
                  type="month"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Account
                <select
                  className={fieldClassName}
                  defaultValue={pageData.data.filters.accountId}
                  name="account"
                >
                  <option value="">All active accounts</option>
                  {pageData.data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className={primaryButtonClassName}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Filter
                </button>
                <Link className={secondaryButtonClassName} href="/dashboard">
                  Reset
                </Link>
              </div>
            </form>
          </Card>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Income" value={formatMoney(pageData.data.summary.income, pageData.data.currency)} />
            <SummaryCard
              label="Expenses"
              value={formatMoney(pageData.data.summary.expenses, pageData.data.currency)}
              tone="expense"
            />
            <SummaryCard
              label="Net cash flow"
              value={formatMoney(pageData.data.summary.netCashFlow, pageData.data.currency)}
              tone={pageData.data.summary.netCashFlow >= 0 ? "income" : "expense"}
            />
            <SummaryCard
              label="Transactions"
              value={formatInteger(pageData.data.summary.transactionCount)}
            />
            <SummaryCard
              label="Uncategorized"
              value={formatInteger(pageData.data.summary.uncategorizedCount)}
              tone={pageData.data.summary.uncategorizedCount > 0 ? "warning" : "neutral"}
            />
            <SummaryCard
              label="Active accounts"
              value={formatInteger(pageData.data.summary.activeAccountCount)}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="overflow-hidden">
              <SectionHeader
                title="Monthly cash flow"
                description={`Last 12 months through ${formatMonth(pageData.data.filters.month)}.`}
              />
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <TableHeader
                    className="grid-cols-[1fr_1fr_1fr_1fr]"
                    columns={["Month", "Income", "Expenses", "Net"]}
                  />
                  {pageData.data.monthlyCashFlow.length === 0 ? (
                    <EmptyState
                      title="No cash flow yet"
                      description="Confirmed transactions will appear here by month."
                    />
                  ) : (
                    pageData.data.monthlyCashFlow.map((month) => (
                      <div
                        className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-line text-sm last:border-b-0"
                        key={month.month}
                      >
                        <div className="px-4 py-3 font-medium text-ink">{formatMonth(month.month)}</div>
                        <div className="px-4 py-3 text-emerald-700">
                          {formatMoney(month.income, pageData.data.currency)}
                        </div>
                        <div className="px-4 py-3 text-rose-700">
                          {formatMoney(month.expenses, pageData.data.currency)}
                        </div>
                        <div
                          className={
                            month.netCashFlow >= 0
                              ? "px-4 py-3 font-semibold text-emerald-700"
                              : "px-4 py-3 font-semibold text-rose-700"
                          }
                        >
                          {formatMoney(month.netCashFlow, pageData.data.currency)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <SectionHeader
                title="Spending by category"
                description={`Expense mix for ${formatMonth(pageData.data.filters.month)}.`}
              />
              {pageData.data.spendingByCategory.length === 0 ? (
                <EmptyState
                  title="No expenses in this period"
                  description="Try another month or confirm an import with expenses."
                />
              ) : (
                <div className="divide-y divide-line">
                  {pageData.data.spendingByCategory.map((category) => (
                    <div className="px-5 py-4" key={category.category}>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <div>
                          <p className="font-semibold text-ink">{category.category}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatInteger(category.transactionCount)} transactions
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-rose-700">
                            {formatMoney(category.total, pageData.data.currency)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatPercent(category.percentage)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-cyan-700"
                          style={{ width: `${Math.min(category.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="overflow-hidden">
              <SectionHeader title="Top merchants" description="Largest expense merchants in the selected month." />
              {pageData.data.topMerchants.length === 0 ? (
                <EmptyState
                  title="No merchant spend yet"
                  description="Merchant summaries use committed expense transactions."
                />
              ) : (
                <div className="divide-y divide-line">
                  {pageData.data.topMerchants.map((merchant) => (
                    <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 text-sm" key={merchant.merchant}>
                      <div>
                        <p className="font-semibold text-ink">{merchant.merchant}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatInteger(merchant.transactionCount)} transactions · {merchant.topCategory}
                        </p>
                      </div>
                      <p className="font-semibold text-rose-700">
                        {formatMoney(merchant.total, pageData.data.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-line p-5">
                <div>
                  <h2 className="text-base font-semibold text-ink">Recent transactions</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Latest active transactions for quick inspection.
                  </p>
                </div>
                <Link className="text-sm font-semibold text-cyan-800 hover:text-cyan-950" href="/transactions">
                  Clean up
                </Link>
              </div>
              {pageData.data.recentTransactions.length === 0 ? (
                <EmptyState
                  title="No recent transactions"
                  description="Confirm an import batch to populate recent activity."
                />
              ) : (
                <div className="divide-y divide-line">
                  {pageData.data.recentTransactions.map((transaction) => (
                    <div
                      className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[120px_1fr_130px]"
                      key={transaction.id}
                    >
                      <div className="text-slate-600">{formatDate(transaction.transaction_date)}</div>
                      <div>
                        <p className="font-semibold text-ink">{transaction.merchant_display_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {transaction.category_name || "Uncategorized"} · {transaction.account_name}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p
                          className={
                            transaction.direction === "expense"
                              ? "font-semibold text-rose-700"
                              : "font-semibold text-emerald-700"
                          }
                        >
                          {formatMoney(transaction.amount, transaction.currency)}
                        </p>
                        <div className="mt-1 sm:flex sm:justify-end">
                          <StatusBadge status={transaction.direction} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle
                title="Import and data health"
                description="A quick read on import quality and cleanup work still waiting."
              />
              <div className="flex gap-2">
                <Link className={secondaryButtonClassName} href="/imports">
                  Imports
                </Link>
                <Link className={secondaryButtonClassName} href="/transactions?uncategorized=1">
                  Uncategorized
                </Link>
              </div>
            </div>
            <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
              <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
                <p className="text-sm font-medium text-slate-500">Uncategorized this month</p>
                <p className="mt-3 text-3xl font-semibold text-ink">
                  {formatInteger(pageData.data.summary.uncategorizedCount)}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Unknown or unassigned transactions should be cleaned up before relying on dashboards.
                </p>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[780px]">
                  <TableHeader
                    className="grid-cols-[1.6fr_120px_110px_110px_100px_90px]"
                    columns={["Import", "Status", "Committed", "Duplicates", "Skipped", "Errors"]}
                  />
                  {pageData.data.latestImports.length === 0 ? (
                    <EmptyState
                      title="No imports yet"
                      description="Upload a CSV or XLSX export to start building dashboard history."
                    />
                  ) : (
                    pageData.data.latestImports.map((batch) => (
                      <div
                        className="grid grid-cols-[1.6fr_120px_110px_110px_100px_90px] border-b border-line text-sm last:border-b-0"
                        key={batch.id}
                      >
                        <div className="px-4 py-3">
                          <Link
                            className="font-semibold text-cyan-800 hover:text-cyan-950"
                            href={`/imports/${batch.id}/review`}
                          >
                            {batch.uploaded_files?.original_filename || batch.id.slice(0, 8)}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {batch.financial_accounts?.name || "Unknown account"}
                          </p>
                        </div>
                        <div className="px-4 py-3">
                          <StatusBadge status={batch.status} />
                        </div>
                        <div className="px-4 py-3 text-slate-600">{formatInteger(batch.committed_rows)}</div>
                        <div className="px-4 py-3 text-slate-600">{formatInteger(batch.duplicate_rows)}</div>
                        <div className="px-4 py-3 text-slate-600">{formatInteger(batch.skipped_rows)}</div>
                        <div className="px-4 py-3 text-slate-600">{formatInteger(batch.error_rows)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function EmptyDashboard({ accountsCount }: { accountsCount: number }) {
  return (
    <Card>
      <EmptyState
        title="No committed transactions yet"
        description={
          accountsCount > 0
            ? "Upload and confirm an import batch to populate dashboard summaries."
            : "Create an account, upload a CSV or XLSX export, then confirm the import to populate summaries."
        }
        action={
          <Link className={primaryButtonClassName} href={accountsCount > 0 ? "/uploads" : "/accounts"}>
            {accountsCount > 0 ? "Upload export" : "Create account"}
          </Link>
        }
      />
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "income" | "expense" | "warning";
}) {
  const valueClassName =
    tone === "income"
      ? "text-emerald-700"
      : tone === "expense"
        ? "text-rose-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-ink";

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${valueClassName}`}>{value}</p>
    </Card>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-line p-5">
      <SectionTitle title={title} description={description} />
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function TableHeader({ columns, className }: { columns: string[]; className: string }) {
  return (
    <div
      className={`grid border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}
    >
      {columns.map((column) => (
        <div className="px-4 py-3" key={column}>
          {column}
        </div>
      ))}
    </div>
  );
}

function readFilters(params: Record<string, string | string[] | undefined>): DashboardFilters {
  return {
    month: firstParam(params.month),
    accountId: firstParam(params.account)
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const param = Array.isArray(value) ? value[0] : value;
  return param?.trim() || undefined;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)}%`;
}
