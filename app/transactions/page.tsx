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
import { loadTransactionPageData } from "@/lib/db/server";
import { formatDate, formatMoney } from "@/lib/format";
import type { TransactionFilters } from "@/lib/db/types";

export const dynamic = "force-dynamic";

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = (await searchParams) ?? {};
  const filters = readFilters(params);
  const pageData = await loadTransactionPageData(filters);

  return (
    <PageShell
      eyebrow="Normalized records"
      title="Transactions"
      description="Inspect committed transactions with practical filters for import validation."
    >
      {pageData.status === "unauthenticated" ? (
        <AuthNotice message="Sign in with Supabase Auth to view transactions." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <label className="block text-sm font-medium text-slate-700 xl:col-span-2">
                Search description
                <input
                  className={fieldClassName}
                  defaultValue={filters.search ?? ""}
                  name="search"
                  placeholder="Netflix, salary, transfer"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Account
                <select className={fieldClassName} defaultValue={filters.accountId ?? ""} name="account">
                  <option value="">All accounts</option>
                  {pageData.data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Direction
                <select className={fieldClassName} defaultValue={filters.direction ?? ""} name="direction">
                  <option value="">All</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Category
                <select className={fieldClassName} defaultValue={filters.categoryId ?? ""} name="category">
                  <option value="">All categories</option>
                  {pageData.data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className={primaryButtonClassName}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Filter
                </button>
                <Link className={secondaryButtonClassName} href="/transactions">
                  Reset
                </Link>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                From
                <input className={fieldClassName} defaultValue={filters.dateFrom ?? ""} name="from" type="date" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                To
                <input className={fieldClassName} defaultValue={filters.dateTo ?? ""} name="to" type="date" />
              </label>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1060px]">
                <div className="grid grid-cols-[120px_160px_1.8fr_140px_120px_160px_130px] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div className="px-4 py-3">Date</div>
                  <div className="px-4 py-3">Account</div>
                  <div className="px-4 py-3">Description</div>
                  <div className="px-4 py-3 text-right">Amount</div>
                  <div className="px-4 py-3">Direction</div>
                  <div className="px-4 py-3">Category</div>
                  <div className="px-4 py-3">Import</div>
                </div>
                {pageData.data.transactions.length === 0 ? (
                  <EmptyState
                    title="No matching transactions"
                    description="Try clearing filters, or confirm an import batch after uploading a CSV or XLSX export."
                    action={
                      <Link className={primaryButtonClassName} href="/uploads">
                        Upload export
                      </Link>
                    }
                  />
                ) : (
                  pageData.data.transactions.map((transaction) => (
                    <div
                      className="grid grid-cols-[120px_160px_1.8fr_140px_120px_160px_130px] border-b border-line text-sm last:border-b-0"
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
                      <div
                        className={
                          transaction.amount < 0
                            ? "px-4 py-3 text-right font-semibold text-rose-700"
                            : "px-4 py-3 text-right font-semibold text-emerald-700"
                        }
                      >
                        {formatMoney(transaction.amount, transaction.currency)}
                      </div>
                      <div className="px-4 py-3">
                        <StatusBadge status={transaction.direction} />
                      </div>
                      <div className="px-4 py-3 text-slate-600">
                        {transaction.transaction_categories?.name || "Uncategorized"}
                      </div>
                      <div className="px-4 py-3 text-slate-600">
                        {transaction.import_batches?.id ? (
                          <Link
                            className="font-semibold text-cyan-800 hover:text-cyan-950"
                            href={`/imports/${transaction.import_batches.id}/review`}
                          >
                            {transaction.import_batches.id.slice(0, 8)}
                          </Link>
                        ) : (
                          "Manual"
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function readFilters(params: Record<string, string | string[] | undefined>): TransactionFilters {
  return {
    search: firstParam(params.search),
    accountId: firstParam(params.account),
    direction: firstParam(params.direction),
    categoryId: firstParam(params.category),
    dateFrom: firstParam(params.from),
    dateTo: firstParam(params.to)
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const param = Array.isArray(value) ? value[0] : value;
  return param?.trim() || undefined;
}
