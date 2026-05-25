export type FinancialAccount = {
  id: string;
  user_id: string;
  name: string;
  institution_name: string | null;
  account_type: "bank" | "credit_card" | "investment" | "crypto" | "debt" | "manual";
  currency: string;
  is_active: boolean;
  created_at: string;
};

export type UploadedFile = {
  id: string;
  user_id: string;
  account_id: string | null;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  content_type: string | null;
  file_size_bytes: number | null;
  file_sha256: string | null;
  source_kind: string;
  status: string;
  uploaded_at: string;
  created_at: string;
};

export type ImportBatch = {
  id: string;
  user_id: string;
  account_id: string | null;
  uploaded_file_id: string | null;
  status: string;
  source_format: string | null;
  mapping_json: Record<string, unknown>;
  total_rows: number;
  staged_rows: number;
  approved_rows: number;
  committed_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  error_rows: number;
  error_message: string | null;
  created_at: string;
  staged_at: string | null;
  committed_at: string | null;
  undone_at: string | null;
};

export type ImportBatchListItem = ImportBatch & {
  financial_accounts: Pick<FinancialAccount, "id" | "name" | "institution_name"> | null;
  uploaded_files: Pick<UploadedFile, "id" | "original_filename" | "storage_path"> | null;
};

export type StagedTransaction = {
  id: string;
  user_id: string;
  import_batch_id: string;
  uploaded_file_id: string | null;
  account_id: string | null;
  row_number: number;
  raw_row: Record<string, unknown>;
  transaction_date: string | null;
  posted_date: string | null;
  description_raw: string | null;
  description_clean: string | null;
  merchant_name: string | null;
  amount: number | null;
  currency: string | null;
  direction: "income" | "expense" | "transfer" | null;
  duplicate_key: string | null;
  duplicate_candidate_transaction_id: string | null;
  committed_transaction_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
};

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  import_batch_id: string | null;
  transaction_date: string;
  description_raw: string;
  description_clean: string | null;
  amount: number;
  currency: string;
  direction: "income" | "expense" | "transfer";
  category_id: string | null;
  duplicate_key: string | null;
  created_at: string;
};

export type TransactionListItem = Transaction & {
  financial_accounts: Pick<FinancialAccount, "id" | "name"> | null;
  transaction_categories: { name: string } | null;
  import_batches: { id: string } | null;
};

export type PageData<T> =
  | { status: "ready"; data: T }
  | { status: "unauthenticated" }
  | { status: "setup_error"; message: string };
