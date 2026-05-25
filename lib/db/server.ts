import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  FinancialAccount,
  ImportBatch,
  ImportBatchListItem,
  PageData,
  StagedTransaction,
  TransactionListItem,
  UploadedFile
} from "@/lib/db/types";

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

export async function loadTransactions(): Promise<PageData<TransactionListItem[]>> {
  return withPageData(async (user) => {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("transactions")
      .select(
        "id,user_id,account_id,import_batch_id,transaction_date,description_raw,description_clean,amount,currency,direction,category_id,duplicate_key,created_at,financial_accounts(id,name),transaction_categories(name),import_batches(id)"
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) =>
      normalizeTransactionListItem(row as Record<string, unknown>)
    );
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
    counts: {
      total: number;
      parseErrors: number;
      duplicates: number;
      requiringReview: number;
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

    return {
      batch: typedBatch,
      account: account as FinancialAccount | null,
      uploadedFile: uploadedFile as UploadedFile | null,
      stagedTransactions: rows,
      counts: {
        total: rows.length,
        parseErrors: rows.filter((row) => row.status === "invalid").length,
        duplicates: rows.filter((row) => row.status === "duplicate").length,
        requiringReview: rows.filter((row) => row.status === "invalid" || row.status === "needs_review")
          .length
      }
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
  return {
    ...(row as Omit<
      TransactionListItem,
      "financial_accounts" | "transaction_categories" | "import_batches"
    >),
    financial_accounts: firstRelation(row.financial_accounts) as TransactionListItem["financial_accounts"],
    transaction_categories: firstRelation(
      row.transaction_categories
    ) as TransactionListItem["transaction_categories"],
    import_batches: firstRelation(row.import_batches) as TransactionListItem["import_batches"]
  };
}

function firstRelation(value: unknown): unknown {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
