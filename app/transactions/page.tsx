import Link from "next/link";
import { Play, Search, Tags } from "lucide-react";
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
import {
  applyTransactionRulesAction,
  createTransactionRuleAction,
  updateTransactionCategoryAction
} from "@/lib/transactions/actions";
import { formatDate, formatMoney } from "@/lib/format";
import type { TransactionFilters } from "@/lib/db/types";

export const dynamic = "force-dynamic";

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = (await searchParams) ?? {};
  const filters = readFilters(params);
  const feedback = readFeedback(params);
  const returnTo = buildReturnTo(params);
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
          {feedback ? (
            <div
              className={
                feedback.type === "success"
                  ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
                  : "rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
              }
            >
              {feedback.message}
            </div>
          ) : null}

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
                <select
                  className={fieldClassName}
                  defaultValue={filters.uncategorized ? "" : filters.categoryId ?? ""}
                  disabled={filters.uncategorized}
                  name="category"
                >
                  <option value="">All categories</option>
                  {pageData.data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
                <input
                  className="h-4 w-4 rounded border-line text-cyan-800 focus:ring-cyan-700"
                  defaultChecked={filters.uncategorized}
                  name="uncategorized"
                  type="checkbox"
                  value="1"
                />
                Uncategorized only
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

          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card className="p-5">
              <form action={createTransactionRuleAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <input name="return_to" type="hidden" value={returnTo} />
                <div className="md:col-span-2 xl:col-span-6">
                  <h2 className="text-base font-semibold text-ink">Create cleanup rule</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Match imported descriptions or normalized merchant names, then assign a category or cleanup flag.
                  </p>
                </div>
                <label className="block text-sm font-medium text-slate-700 xl:col-span-2">
                  Rule name
                  <input className={fieldClassName} name="name" placeholder="Woolworths groceries" />
                </label>
                <label className="block text-sm font-medium text-slate-700 xl:col-span-2">
                  Pattern
                  <input className={fieldClassName} name="pattern" placeholder="Woolworths" required />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Match
                  <select className={fieldClassName} defaultValue="contains" name="match_type">
                    <option value="contains">Contains</option>
                    <option value="exact">Exact</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Priority
                  <input className={fieldClassName} defaultValue="100" min="1" name="priority" type="number" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Category
                  <select className={fieldClassName} name="category_id">
                    <option value="">No category</option>
                    {pageData.data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Direction
                  <select className={fieldClassName} name="direction">
                    <option value="">Any</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
                  <input className="h-4 w-4 rounded border-line text-cyan-800 focus:ring-cyan-700" name="is_subscription" type="checkbox" />
                  Subscription
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
                  <input className="h-4 w-4 rounded border-line text-cyan-800 focus:ring-cyan-700" name="is_transfer" type="checkbox" />
                  Transfer
                </label>
                <div className="flex items-end">
                  <button className={primaryButtonClassName}>
                    <Tags className="h-4 w-4" aria-hidden="true" />
                    Save rule
                  </button>
                </div>
              </form>
            </Card>
            <Card className="p-5">
              <form action={applyTransactionRulesAction} className="flex h-full flex-col justify-between gap-5">
                <input name="return_to" type="hidden" value={returnTo} />
                <div>
                  <h2 className="text-base font-semibold text-ink">Apply rules</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Runs active rules over uncategorized, non-deleted transactions only.
                  </p>
                </div>
                <button className={`${secondaryButtonClassName} w-full`}>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Apply to uncategorized
                </button>
              </form>
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[1540px]">
                <div className="grid grid-cols-[112px_210px_360px_140px_120px_220px_210px_100px] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div className="px-4 py-3">Date</div>
                  <div className="px-4 py-3">Merchant</div>
                  <div className="px-4 py-3">Description</div>
                  <div className="px-4 py-3 text-right">Amount</div>
                  <div className="px-4 py-3">Direction</div>
                  <div className="px-4 py-3">Category</div>
                  <div className="px-4 py-3">Actions</div>
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
                    <form
                      action={updateTransactionCategoryAction}
                      className="grid grid-cols-[112px_210px_360px_140px_120px_220px_210px_100px] border-b border-line text-sm last:border-b-0"
                      key={transaction.id}
                    >
                      <input name="return_to" type="hidden" value={returnTo} />
                      <input name="transaction_id" type="hidden" value={transaction.id} />
                      <input name="pattern" type="hidden" value={transaction.merchant_display_name} />
                      <input name="match_type" type="hidden" value="contains" />
                      <input name="priority" type="hidden" value="100" />
                      <div className="px-4 py-3 text-slate-600">
                        {formatDate(transaction.transaction_date)}
                      </div>
                      <div className="px-4 py-3">
                        <div className="font-semibold text-ink">{transaction.merchant_display_name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {transaction.financial_accounts?.name || "Unknown account"}
                        </div>
                      </div>
                      <div className="px-4 py-3 font-medium text-ink" title={transaction.description_raw}>
                        <div className="line-clamp-2">
                          {transaction.description_clean || transaction.description_raw}
                        </div>
                        <div className="mt-1 text-xs font-normal text-slate-500">
                          Key: {transaction.merchant_normalized_key}
                        </div>
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
                        <div className="mt-2 flex flex-wrap gap-1">
                          {transaction.is_subscription ? <StatusBadge status="subscription" /> : null}
                          {transaction.is_transfer ? <StatusBadge status="transfer" /> : null}
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <label className="sr-only" htmlFor={`category-${transaction.id}`}>
                          Category
                        </label>
                        <select
                          className={`${fieldClassName} mt-0`}
                          defaultValue={transaction.category_id ?? ""}
                          id={`category-${transaction.id}`}
                          name="category_id"
                        >
                          <option value="">Uncategorized</option>
                          {pageData.data.categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500">
                          {transaction.transaction_categories?.name || "Uncategorized"}
                        </p>
                      </div>
                      <div className="px-4 py-3">
                        <div className="grid gap-2">
                          <button
                            className={`${secondaryButtonClassName} px-3 py-1.5 text-xs`}
                            formAction={updateTransactionCategoryAction}
                          >
                            Save
                          </button>
                          <button
                            className={`${secondaryButtonClassName} px-3 py-1.5 text-xs`}
                            formAction={createTransactionRuleAction}
                          >
                            Create rule
                          </button>
                          <button
                            className={`${secondaryButtonClassName} px-3 py-1.5 text-xs`}
                            formAction={applyTransactionRulesAction}
                          >
                            Apply row
                          </button>
                        </div>
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
                    </form>
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

function buildReturnTo(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (key === "notice" || key === "message") {
      return;
    }

    const firstValue = firstParam(value);
    if (firstValue) {
      query.set(key, firstValue);
    }
  });

  const serialized = query.toString();
  return serialized ? `/transactions?${serialized}` : "/transactions";
}

function readFeedback(
  params: Record<string, string | string[] | undefined>
): { type: "success" | "error"; message: string } | null {
  const notice = firstParam(params.notice);
  const message = firstParam(params.message);

  if ((notice !== "success" && notice !== "error") || !message) {
    return null;
  }

  return {
    type: notice,
    message
  };
}

function readFilters(params: Record<string, string | string[] | undefined>): TransactionFilters {
  return {
    search: firstParam(params.search),
    accountId: firstParam(params.account),
    direction: firstParam(params.direction),
    categoryId: firstParam(params.category),
    uncategorized: firstParam(params.uncategorized) === "1",
    dateFrom: firstParam(params.from),
    dateTo: firstParam(params.to)
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const param = Array.isArray(value) ? value[0] : value;
  return param?.trim() || undefined;
}
