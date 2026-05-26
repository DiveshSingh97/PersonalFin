import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { FinancialAccount, ImportBatchListItem, PageData } from "@/lib/db/types";
import { normalizeMerchantDescription } from "@/lib/transactions/merchant-normalization";
import {
  calculateDashboardSummary,
  getMonthRange,
  groupMonthlyCashFlow,
  groupSpendingByCategory,
  groupTopMerchants,
  isMonthValue,
  shiftMonth,
  type DashboardTransaction
} from "@/lib/dashboard/calculations";

export type DashboardFilters = {
  month?: string;
  accountId?: string;
};

export type DashboardData = {
  filters: Required<DashboardFilters>;
  dateRange: {
    start: string;
    endExclusive: string;
  };
  currency: string;
  accounts: FinancialAccount[];
  summary: ReturnType<typeof calculateDashboardSummary>;
  monthlyCashFlow: ReturnType<typeof groupMonthlyCashFlow>;
  spendingByCategory: ReturnType<typeof groupSpendingByCategory>;
  topMerchants: ReturnType<typeof groupTopMerchants>;
  recentTransactions: DashboardTransaction[];
  latestImports: ImportBatchListItem[];
  hasAnyTransactions: boolean;
};

const transactionSelect =
  "id,user_id,account_id,import_batch_id,merchant_id,transaction_date,description_raw,description_clean,amount,currency,direction,category_id,is_subscription,is_transfer,duplicate_key,created_at,financial_accounts(id,name),transaction_categories(id,name),merchants(id,canonical_name,normalized_key),import_batches(id)";

export async function loadDashboardPageData(
  filters: DashboardFilters
): Promise<PageData<DashboardData>> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    const { data: accountsData, error: accountsError } = await admin
      .from("financial_accounts")
      .select("id,user_id,name,institution_name,account_type,currency,is_active,created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (accountsError) {
      throw accountsError;
    }

    const accounts = (accountsData ?? []) as FinancialAccount[];
    const accountId = accounts.some((account) => account.id === filters.accountId)
      ? filters.accountId
      : "";
    const month = isMonthValue(filters.month)
      ? filters.month
      : await determineDefaultMonth(user.id, accountId || null);
    const dateRange = getMonthRange(month);
    const cashFlowStart = getMonthRange(shiftMonth(month, -11)).start;

    const [
      selectedTransactionsResult,
      cashFlowTransactionsResult,
      recentTransactionsResult,
      latestImportsResult,
      anyTransactionsResult
    ] = await Promise.all([
      loadTransactionsForDashboard({
        userId: user.id,
        accountId: accountId || null,
        start: dateRange.start,
        endExclusive: dateRange.endExclusive,
        limit: 5000
      }),
      loadTransactionsForDashboard({
        userId: user.id,
        accountId: accountId || null,
        start: cashFlowStart,
        endExclusive: dateRange.endExclusive,
        limit: 5000
      }),
      loadTransactionsForDashboard({
        userId: user.id,
        accountId: accountId || null,
        limit: 8
      }),
      admin
        .from("import_batches")
        .select(
          "*, financial_accounts(id,name,institution_name), uploaded_files(id,original_filename,storage_path)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      admin.from("transactions").select("id").eq("user_id", user.id).is("deleted_at", null).limit(1)
    ]);

    if (latestImportsResult.error) {
      throw latestImportsResult.error;
    }

    if (anyTransactionsResult.error) {
      throw anyTransactionsResult.error;
    }

    const selectedTransactions = selectedTransactionsResult;
    const currency = selectedTransactions[0]?.currency ?? accounts[0]?.currency ?? "ZAR";

    return {
      filters: {
        month,
        accountId: accountId ?? ""
      },
      dateRange,
      currency,
      accounts,
      summary: calculateDashboardSummary(
        selectedTransactions,
        accounts.filter((account) => account.is_active).length
      ),
      monthlyCashFlow: groupMonthlyCashFlow(cashFlowTransactionsResult),
      spendingByCategory: groupSpendingByCategory(selectedTransactions),
      topMerchants: groupTopMerchants(selectedTransactions).slice(0, 8),
      recentTransactions: recentTransactionsResult,
      latestImports: (latestImportsResult.data ?? []).map((row) =>
        normalizeImportBatchListItem(row as Record<string, unknown>)
      ),
      hasAnyTransactions: (anyTransactionsResult.data ?? []).length > 0
    };
  });
}

async function loadTransactionsForDashboard(input: {
  userId: string;
  accountId: string | null;
  start?: string;
  endExclusive?: string;
  limit: number;
}): Promise<DashboardTransaction[]> {
  const admin = createServiceRoleClient();
  let query = admin
    .from("transactions")
    .select(transactionSelect)
    .eq("user_id", input.userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(input.limit);

  if (input.accountId) {
    query = query.eq("account_id", input.accountId);
  }

  if (input.start) {
    query = query.gte("transaction_date", input.start);
  }

  if (input.endExclusive) {
    query = query.lt("transaction_date", input.endExclusive);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => normalizeDashboardTransaction(row as Record<string, unknown>));
}

async function determineDefaultMonth(userId: string, accountId: string | null): Promise<string> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentRange = getMonthRange(currentMonth);
  const admin = createServiceRoleClient();
  let currentQuery = admin
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("transaction_date", currentRange.start)
    .lt("transaction_date", currentRange.endExclusive)
    .limit(1);

  if (accountId) {
    currentQuery = currentQuery.eq("account_id", accountId);
  }

  const { data: currentData, error: currentError } = await currentQuery;

  if (currentError) {
    throw currentError;
  }

  if ((currentData ?? []).length > 0) {
    return currentMonth;
  }

  let latestQuery = admin
    .from("transactions")
    .select("transaction_date")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(1);

  if (accountId) {
    latestQuery = latestQuery.eq("account_id", accountId);
  }

  const { data: latestData, error: latestError } = await latestQuery;

  if (latestError) {
    throw latestError;
  }

  return latestData?.[0]?.transaction_date
    ? String(latestData[0].transaction_date).slice(0, 7)
    : currentMonth;
}

async function withPageData<T>(loader: (user: User) => Promise<T>): Promise<PageData<T>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { status: "unauthenticated" };
    }

    return {
      status: "ready",
      data: await loader(user)
    };
  } catch (error) {
    return {
      status: "setup_error",
      message: error instanceof Error ? error.message : "Unexpected dashboard loading error"
    };
  }
}

function normalizeDashboardTransaction(row: Record<string, unknown>): DashboardTransaction {
  const merchant = firstRelation(row.merchants) as
    | { canonical_name?: string; normalized_key?: string }
    | null;
  const category = firstRelation(row.transaction_categories) as { id?: string; name?: string } | null;
  const account = firstRelation(row.financial_accounts) as { id?: string; name?: string } | null;
  const normalizedMerchant = normalizeMerchantDescription(
    String(row.description_clean || row.description_raw || "")
  );

  return {
    id: String(row.id),
    transaction_date: String(row.transaction_date),
    amount: Number(row.amount),
    currency: String(row.currency ?? "ZAR"),
    direction: normalizeDirection(row.direction),
    category_id: row.category_id ? String(row.category_id) : null,
    category_name: category?.name ?? null,
    merchant_display_name: merchant?.canonical_name ?? normalizedMerchant.displayName,
    account_name: account?.name ?? "Unknown account",
    description: String(row.description_clean || row.description_raw || ""),
    import_batch_id: row.import_batch_id ? String(row.import_batch_id) : null
  };
}

function normalizeImportBatchListItem(row: Record<string, unknown>): ImportBatchListItem {
  return {
    ...(row as Omit<ImportBatchListItem, "financial_accounts" | "uploaded_files">),
    financial_accounts: firstRelation(row.financial_accounts) as ImportBatchListItem["financial_accounts"],
    uploaded_files: firstRelation(row.uploaded_files) as ImportBatchListItem["uploaded_files"]
  };
}

function normalizeDirection(value: unknown): "income" | "expense" | "transfer" {
  return value === "income" || value === "transfer" ? value : "expense";
}

function firstRelation(value: unknown): unknown {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
