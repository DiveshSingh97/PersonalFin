import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  FinancialAccount,
  ImportBatch,
  ImportBatchListItem,
  PageData,
  StagedTransaction,
  TransactionCategory,
  TransactionFilters,
  TransactionListItem,
  UploadedFile
} from "@/lib/db/types";
import { calculateStagedStatusCounts } from "@/lib/imports/review";
import { normalizeMerchantDescription } from "@/lib/transactions/merchant-normalization";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to do that.");
  }

  return user;
}

export async function loadAccounts(): Promise<PageData<FinancialAccount[]>> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("financial_accounts")
      .select("id,user_id,name,institution_name,account_type,currency,is_active,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as FinancialAccount[];
  });
}

export async function loadImports(): Promise<PageData<ImportBatchListItem[]>> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("import_batches")
      .select(
        "*, financial_accounts(id,name,institution_name), uploaded_files(id,original_filename,storage_path)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as ImportBatchListItem[];
  });
}

export async function loadTransactions(
  filters: TransactionFilters = {}
): Promise<PageData<TransactionListItem[]>> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    let query = admin
      .from("transactions")
      .select(
        "id,user_id,account_id,import_batch_id,merchant_id,transaction_date,description_raw,description_clean,amount,currency,direction,category_id,is_subscription,is_transfer,duplicate_key,created_at,financial_accounts(id,name),transaction_categories(id,name),merchants(id,canonical_name,normalized_key),import_batches(id)"
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(200);

    if (filters.search) {
      query = query.or(
        `description_raw.ilike.%${filters.search}%,description_clean.ilike.%${filters.search}%`
      );
    }

    if (filters.accountId) {
      query = query.eq("account_id", filters.accountId);
    }

    if (filters.direction) {
      query = query.eq("direction", filters.direction);
    }

    if (filters.uncategorized) {
      query = query.is("category_id", null);
    } else if (filters.categoryId) {
      query = query.eq("category_id", filters.categoryId);
    }

    if (filters.dateFrom) {
      query = query.gte("transaction_date", filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte("transaction_date", filters.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) =>
      normalizeTransactionListItem(row as Record<string, unknown>)
    );
  });
}

export async function loadTransactionPageData(
  filters: TransactionFilters
): Promise<
  PageData<{
    transactions: TransactionListItem[];
    accounts: FinancialAccount[];
    categories: TransactionCategory[];
    filters: TransactionFilters;
  }>
> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    const [transactions, accountsResult, categoriesResult] = await Promise.all([
      loadTransactions(filters),
      admin
        .from("financial_accounts")
        .select("id,user_id,name,institution_name,account_type,currency,is_active,created_at")
        .eq("user_id", user.id)
        .order("name", { ascending: true }),
      admin
        .from("transaction_categories")
        .select("id,name,slug")
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order("name", { ascending: true })
    ]);

    if (transactions.status !== "ready") {
      throw new Error("Unable to load transactions.");
    }

    if (accountsResult.error) {
      throw accountsResult.error;
    }

    if (categoriesResult.error) {
      throw categoriesResult.error;
    }

    return {
      transactions: transactions.data,
      accounts: (accountsResult.data ?? []) as FinancialAccount[],
      categories: (categoriesResult.data ?? []) as TransactionCategory[],
      filters
    };
  });
}

export async function loadUploadFormData(): Promise<PageData<{ accounts: FinancialAccount[] }>> {
  const accounts = await loadAccounts();

  if (accounts.status !== "ready") {
    return accounts;
  }

  return {
    status: "ready",
    data: {
      accounts: accounts.data
    }
  };
}

export async function loadImportReview(
  importBatchId: string
): Promise<
  PageData<{
    batch: ImportBatch;
    account: FinancialAccount | null;
    uploadedFile: UploadedFile | null;
    stagedTransactions: StagedTransaction[];
    sourceColumns: string[];
    counts: {
      total: number;
      parseErrors: number;
      duplicates: number;
      requiringReview: number;
      approved: number;
      invalid: number;
      duplicate: number;
      skipped: number;
      committed: number;
      needs_review: number;
    };
  }>
> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    const { data: batch, error: batchError } = await admin
      .from("import_batches")
      .select("*")
      .eq("id", importBatchId)
      .eq("user_id", user.id)
      .single();

    if (batchError) {
      throw batchError;
    }

    const typedBatch = batch as ImportBatch;
    const [{ data: account }, { data: uploadedFile }, { data: stagedTransactions, error: stagedError }] =
      await Promise.all([
        typedBatch.account_id
          ? admin
              .from("financial_accounts")
              .select("id,user_id,name,institution_name,account_type,currency,is_active,created_at")
              .eq("id", typedBatch.account_id)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        typedBatch.uploaded_file_id
          ? admin
              .from("uploaded_files")
              .select("*")
              .eq("id", typedBatch.uploaded_file_id)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        admin
          .from("staged_transactions")
          .select("*")
          .eq("import_batch_id", importBatchId)
          .eq("user_id", user.id)
          .order("row_number", { ascending: true })
          .limit(200)
      ]);

    if (stagedError) {
      throw stagedError;
    }

    const rows = (stagedTransactions ?? []) as StagedTransaction[];
    const sourceColumns = Array.from(
      rows.reduce((columns, row) => {
        Object.keys(row.raw_row ?? {}).forEach((key) => columns.add(key));
        return columns;
      }, new Set<string>())
    );
    const counts = calculateStagedStatusCounts(rows);

    return {
      batch: typedBatch,
      account: account as FinancialAccount | null,
      uploadedFile: uploadedFile as UploadedFile | null,
      stagedTransactions: rows,
      sourceColumns,
      counts
    };
  });
}

async function withPageData<T>(loader: (user: User) => Promise<T>): Promise<PageData<T>> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { status: "unauthenticated" };
    }

    return {
      status: "ready",
      data: await loader(user)
    };
  } catch (error) {
    return {
      status: "setup_error",
      message: error instanceof Error ? error.message : "Unexpected data loading error"
    };
  }
}

function normalizeTransactionListItem(row: Record<string, unknown>): TransactionListItem {
  const merchantRelation = firstRelation(row.merchants) as TransactionListItem["merchants"];
  const normalizedMerchant = normalizeMerchantDescription(
    String(row.description_clean || row.description_raw || "")
  );

  return {
    ...(row as Omit<
      TransactionListItem,
      | "financial_accounts"
      | "transaction_categories"
      | "merchants"
      | "import_batches"
      | "merchant_display_name"
      | "merchant_normalized_key"
    >),
    financial_accounts: firstRelation(row.financial_accounts) as TransactionListItem["financial_accounts"],
    transaction_categories: firstRelation(
      row.transaction_categories
    ) as TransactionListItem["transaction_categories"],
    merchants: merchantRelation,
    import_batches: firstRelation(row.import_batches) as TransactionListItem["import_batches"],
    merchant_display_name: merchantRelation?.canonical_name ?? normalizedMerchant.displayName,
    merchant_normalized_key: merchantRelation?.normalized_key ?? normalizedMerchant.normalizedKey
  };
}

function firstRelation(value: unknown): unknown {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
