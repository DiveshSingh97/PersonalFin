"use server";

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/db/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { type ImportColumnMapping, parseImportFile } from "@/lib/imports/parser";
import {
  applyDuplicateStatuses,
  calculateStagedStatusCounts,
  mapRawRowWithMapping,
  normalizeStatus,
  validateStagedRow
} from "@/lib/imports/review";

const accountTypes = new Set(["bank", "credit_card", "investment", "crypto", "debt", "manual"]);

export async function createAccountAction(formData: FormData) {
  const user = await requireCurrentUser();
  const name = getTextField(formData, "name");
  const providerName = getTextField(formData, "provider_name");
  const accountType = getTextField(formData, "account_type") || "bank";
  const currency = (getTextField(formData, "currency") || "ZAR").toUpperCase();

  if (!name) {
    throw new Error("Account name is required.");
  }

  if (!accountTypes.has(accountType)) {
    throw new Error("Unsupported account type.");
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a three-letter code.");
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("financial_accounts").insert({
    user_id: user.id,
    name,
    institution_name: providerName || null,
    account_type: accountType,
    currency
  });

  if (error) {
    throw error;
  }

  revalidatePath("/accounts");
  revalidatePath("/uploads");
}

export async function uploadImportAction(formData: FormData) {
  const user = await requireCurrentUser();
  const env = getServerEnv();
  const admin = createServiceRoleClient();
  const accountId = getTextField(formData, "account_id");
  const sourceProvider = getTextField(formData, "source_provider");
  const file = formData.get("file");

  if (!accountId) {
    throw new Error("Choose an account before uploading.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a CSV or XLSX file to upload.");
  }

  assertSupportedFile(file.name);

  const { data: account, error: accountError } = await admin
    .from("financial_accounts")
    .select("id,currency")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (accountError) {
    throw accountError;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadedFileId = randomUUID();
  const safeName = makeSafeFileName(file.name);
  const today = new Date().toISOString().slice(0, 10);
  const storagePath = `${user.id}/${accountId}/${today}/${uploadedFileId}-${safeName}`;
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const { error: uploadError } = await admin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || contentTypeFromName(file.name),
      upsert: false
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: uploadedFile, error: fileInsertError } = await admin
    .from("uploaded_files")
    .insert({
      id: uploadedFileId,
      user_id: user.id,
      account_id: accountId,
      storage_bucket: env.SUPABASE_STORAGE_BUCKET,
      storage_path: storagePath,
      original_filename: file.name,
      content_type: file.type || contentTypeFromName(file.name),
      file_size_bytes: file.size,
      file_sha256: checksum,
      status: "parsing"
    })
    .select("id")
    .single();

  if (fileInsertError) {
    await admin.storage.from(env.SUPABASE_STORAGE_BUCKET).remove([storagePath]);
    throw fileInsertError;
  }

  const parsed = await parseImportFile({
    buffer,
    fileName: file.name,
    accountId,
    defaultCurrency: String(account.currency ?? "ZAR")
  });

  const { data: batch, error: batchInsertError } = await admin
    .from("import_batches")
    .insert({
      user_id: user.id,
      account_id: accountId,
      uploaded_file_id: uploadedFile.id,
      status: "parsing",
      source_format: parsed.sourceFormat,
      mapping_json: {
        ...parsed.mapping,
        source_provider: sourceProvider || null
      },
      total_rows: parsed.rows.length,
      started_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (batchInsertError) {
    throw batchInsertError;
  }

  const duplicateCandidateIds = await findExistingDuplicateCandidates({
    userId: user.id,
    accountId,
    duplicateKeys: parsed.rows
      .map((row) => row.duplicateKey)
      .filter((key): key is string => Boolean(key))
  });

  const stagedRows = parsed.rows.map((row) => {
    const existingDuplicateId = row.duplicateKey ? duplicateCandidateIds.get(row.duplicateKey) : null;
    const status = existingDuplicateId ? "duplicate" : row.status;

    return {
      user_id: user.id,
      import_batch_id: batch.id,
      uploaded_file_id: uploadedFile.id,
      account_id: accountId,
      row_number: row.rowNumber,
      raw_row: row.rawRow,
      transaction_date: row.transactionDate,
      posted_date: row.postedDate,
      description_raw: row.descriptionRaw,
      description_clean: row.descriptionClean,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      duplicate_key: row.duplicateKey,
      duplicate_candidate_transaction_id: existingDuplicateId,
      status,
      error_code: existingDuplicateId ? "duplicate_existing_transaction" : row.errorCode,
      error_message: existingDuplicateId ? "Duplicate candidate already exists" : row.errorMessage
    };
  });

  if (stagedRows.length > 0) {
    const { error: stagedInsertError } = await admin.from("staged_transactions").insert(stagedRows);

    if (stagedInsertError) {
      await admin
        .from("import_batches")
        .update({ status: "failed", error_message: stagedInsertError.message })
        .eq("id", batch.id)
        .eq("user_id", user.id);
      throw stagedInsertError;
    }
  }

  const duplicateRows = stagedRows.filter((row) => row.status === "duplicate").length;
  const errorRows = stagedRows.filter((row) => row.status === "invalid").length;
  const approvedRows = stagedRows.filter((row) => row.status === "approved").length;

  await Promise.all([
    admin
      .from("import_batches")
      .update({
        status: "reviewing",
        staged_rows: stagedRows.length,
        approved_rows: approvedRows,
        duplicate_rows: duplicateRows,
        error_rows: errorRows,
        staged_at: new Date().toISOString()
      })
      .eq("id", batch.id)
      .eq("user_id", user.id),
    admin
      .from("uploaded_files")
      .update({ status: "staged" })
      .eq("id", uploadedFile.id)
      .eq("user_id", user.id)
  ]);

  revalidatePath("/uploads");
  revalidatePath("/imports");
  redirect(`/imports/${batch.id}/review`);
}

export async function confirmImportAction(formData: FormData) {
  const user = await requireCurrentUser();
  const batchId = getTextField(formData, "batch_id");

  if (!batchId) {
    throw new Error("Import batch is required.");
  }

  const admin = createServiceRoleClient();
  const { data: batch, error: batchError } = await admin
    .from("import_batches")
    .select("id,user_id,uploaded_file_id,status")
    .eq("id", batchId)
    .eq("user_id", user.id)
    .single();

  if (batchError) {
    throw batchError;
  }

  if (batch.status === "committed") {
    redirect(`/imports/${batchId}/review`);
  }

  if (batch.status === "undone") {
    redirect(`/imports/${batchId}/review`);
  }

  await admin
    .from("import_batches")
    .update({ status: "committing" })
    .eq("id", batchId)
    .eq("user_id", user.id);

  const { data: stagedRows, error: stagedError } = await admin
    .from("staged_transactions")
    .select(
      "id,user_id,account_id,import_batch_id,transaction_date,posted_date,description_raw,description_clean,amount,currency,direction,category_id,duplicate_key"
    )
    .eq("import_batch_id", batchId)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .order("row_number", { ascending: true });

  if (stagedError) {
    throw stagedError;
  }

  const { data: alreadyCommitted, error: committedLookupError } = await admin
    .from("transactions")
    .select("staged_transaction_id")
    .eq("import_batch_id", batchId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (committedLookupError) {
    throw committedLookupError;
  }

  const alreadyCommittedStagedIds = new Set(
    (alreadyCommitted ?? [])
      .map((row) => row.staged_transaction_id)
      .filter((id): id is string => Boolean(id))
  );

  const approvedRows = (stagedRows ?? []).filter(
    (row) =>
      row.account_id &&
      row.transaction_date &&
      row.description_raw &&
      row.amount !== null &&
      row.direction &&
      !alreadyCommittedStagedIds.has(row.id)
  );

  const existingDuplicateKeys = await findExistingDuplicateCandidates({
    userId: user.id,
    accountId: null,
    duplicateKeys: approvedRows
      .map((row) => row.duplicate_key)
      .filter((key): key is string => Boolean(key))
  });

  const rowsToCommit = approvedRows.filter(
    (row) => !row.duplicate_key || !existingDuplicateKeys.has(row.duplicate_key)
  );

  const inserted =
    rowsToCommit.length > 0
      ? await admin
          .from("transactions")
          .insert(
            rowsToCommit.map((row) => ({
              user_id: user.id,
              account_id: row.account_id,
              import_batch_id: batchId,
              staged_transaction_id: row.id,
              transaction_date: row.transaction_date,
              posted_date: row.posted_date,
              description_raw: row.description_raw,
              description_clean: row.description_clean,
              amount: row.amount,
              currency: row.currency ?? "ZAR",
              direction: row.direction,
              category_id: row.category_id,
              duplicate_key: row.duplicate_key,
              user_verified: true
            }))
          )
          .select("id,staged_transaction_id")
      : { data: [], error: null };

  if (inserted.error) {
    await admin
      .from("import_batches")
      .update({ status: "failed", error_message: inserted.error.message })
      .eq("id", batchId)
      .eq("user_id", user.id);
    throw inserted.error;
  }

  const committedRows = inserted.data ?? [];

  await Promise.all(
    committedRows.map((transaction) =>
      admin
        .from("staged_transactions")
        .update({
          status: "committed",
          committed_transaction_id: transaction.id,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", transaction.staged_transaction_id)
        .eq("user_id", user.id)
    )
  );

  await Promise.all([
    admin
      .from("import_batches")
      .update({
        status: "committed",
        committed_rows: committedRows.length,
        skipped_rows: approvedRows.length - committedRows.length,
        committed_at: new Date().toISOString(),
        error_message: null
      })
      .eq("id", batchId)
      .eq("user_id", user.id),
    batch.uploaded_file_id
      ? admin
          .from("uploaded_files")
          .update({ status: "committed" })
          .eq("id", batch.uploaded_file_id)
          .eq("user_id", user.id)
      : Promise.resolve()
  ]);

  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}/review`);
  revalidatePath("/transactions");
  redirect(`/imports/${batchId}/review`);
}

export async function undoImportAction(formData: FormData) {
  const user = await requireCurrentUser();
  const batchId = getTextField(formData, "batch_id");

  if (!batchId) {
    throw new Error("Import batch is required.");
  }

  const admin = createServiceRoleClient();
  const deletedAt = new Date().toISOString();
  const { error: transactionError } = await admin
    .from("transactions")
    .update({ deleted_at: deletedAt })
    .eq("import_batch_id", batchId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (transactionError) {
    throw transactionError;
  }

  const { error: batchError } = await admin
    .from("import_batches")
    .update({ status: "undone", undone_at: deletedAt })
    .eq("id", batchId)
    .eq("user_id", user.id);

  if (batchError) {
    throw batchError;
  }

  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}/review`);
  revalidatePath("/transactions");
  redirect(`/imports/${batchId}/review`);
}

export async function updateImportMappingAction(formData: FormData) {
  const user = await requireCurrentUser();
  const batchId = getTextField(formData, "batch_id");

  if (!batchId) {
    throw new Error("Import batch is required.");
  }

  const mapping = readMappingFromForm(formData);
  const admin = createServiceRoleClient();
  const { data: batch, error: batchError } = await admin
    .from("import_batches")
    .select("id,user_id,account_id,uploaded_file_id,status,mapping_json")
    .eq("id", batchId)
    .eq("user_id", user.id)
    .single();

  if (batchError) {
    throw batchError;
  }

  if (batch.status === "committed" || batch.status === "undone") {
    redirect(`/imports/${batchId}/review`);
  }

  const { data: account, error: accountError } = batch.account_id
    ? await admin
        .from("financial_accounts")
        .select("id,currency")
        .eq("id", batch.account_id)
        .eq("user_id", user.id)
        .single()
    : { data: null, error: null };

  if (accountError) {
    throw accountError;
  }

  const { data: stagedRows, error: stagedError } = await admin
    .from("staged_transactions")
    .select("id,raw_row,duplicate_candidate_transaction_id")
    .eq("import_batch_id", batchId)
    .eq("user_id", user.id)
    .order("row_number", { ascending: true });

  if (stagedError) {
    throw stagedError;
  }

  const mappedRows = (stagedRows ?? []).map((row) =>
    mapRawRowWithMapping({
      rawRow: (row.raw_row ?? {}) as Record<string, unknown>,
      mapping,
      accountId: batch.account_id,
      defaultCurrency: String(account?.currency ?? "ZAR"),
      duplicateCandidateTransactionId: row.duplicate_candidate_transaction_id
    })
  );

  const duplicateCandidateIds = await findExistingDuplicateCandidates({
    userId: user.id,
    accountId: batch.account_id,
    duplicateKeys: mappedRows
      .map((row) => row.duplicate_key)
      .filter((key): key is string => Boolean(key))
  });
  const duplicateAwareRows = applyDuplicateStatuses(
    mappedRows,
    new Set(duplicateCandidateIds.keys()),
    duplicateCandidateIds
  );

  await Promise.all(
    (stagedRows ?? []).map((row, index) =>
      admin
        .from("staged_transactions")
        .update(duplicateAwareRows[index])
        .eq("id", row.id)
        .eq("user_id", user.id)
    )
  );

  await admin
    .from("import_batches")
    .update({
      mapping_json: {
        ...(isRecord(batch.mapping_json) ? batch.mapping_json : {}),
        ...mapping,
        review_mapping_updated_at: new Date().toISOString()
      },
      status: "reviewing",
      error_message: null
    })
    .eq("id", batchId)
    .eq("user_id", user.id);

  await refreshImportBatchCounts(batchId, user.id);
  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}/review`);
  redirect(`/imports/${batchId}/review`);
}

export async function updateStagedRowAction(formData: FormData) {
  const user = await requireCurrentUser();
  const batchId = getTextField(formData, "batch_id");
  const rowId = getTextField(formData, "row_id");

  if (!batchId || !rowId) {
    throw new Error("Import batch and row are required.");
  }

  const admin = createServiceRoleClient();
  const { data: batch, error: batchError } = await admin
    .from("import_batches")
    .select("id,status")
    .eq("id", batchId)
    .eq("user_id", user.id)
    .single();

  if (batchError) {
    throw batchError;
  }

  if (batch.status === "committed" || batch.status === "undone") {
    redirect(`/imports/${batchId}/review`);
  }

  const { data: currentRow, error: rowError } = await admin
    .from("staged_transactions")
    .select("id,account_id,duplicate_candidate_transaction_id")
    .eq("id", rowId)
    .eq("import_batch_id", batchId)
    .eq("user_id", user.id)
    .single();

  if (rowError) {
    throw rowError;
  }

  const validated = validateStagedRow({
    id: currentRow.id,
    accountId: currentRow.account_id,
    transactionDate: getTextField(formData, "transaction_date") || null,
    postedDate: getTextField(formData, "posted_date") || null,
    descriptionRaw: getTextField(formData, "description_raw") || null,
    amount: getNumberField(formData, "amount"),
    currency: getTextField(formData, "currency") || null,
    direction: getDirectionField(formData, "direction"),
    status: normalizeStatus(getTextField(formData, "status")),
    duplicateCandidateTransactionId: currentRow.duplicate_candidate_transaction_id
  });
  const duplicateChecked = await protectEditedRowFromAccidentalDuplicate({
    userId: user.id,
    batchId,
    rowId,
    row: validated
  });

  const { error: updateError } = await admin
    .from("staged_transactions")
    .update(duplicateChecked)
    .eq("id", rowId)
    .eq("user_id", user.id);

  if (updateError) {
    throw updateError;
  }

  await refreshImportBatchCounts(batchId, user.id);
  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}/review`);
}

export async function bulkUpdateStagedRowsAction(formData: FormData) {
  const user = await requireCurrentUser();
  const batchId = getTextField(formData, "batch_id");
  const action = getTextField(formData, "bulk_action");
  const rowIds = formData
    .getAll("row_id")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (!batchId) {
    throw new Error("Import batch is required.");
  }

  if (rowIds.length === 0) {
    redirect(`/imports/${batchId}/review`);
  }

  const admin = createServiceRoleClient();
  const { data: batch, error: batchError } = await admin
    .from("import_batches")
    .select("id,status")
    .eq("id", batchId)
    .eq("user_id", user.id)
    .single();

  if (batchError) {
    throw batchError;
  }

  if (batch.status === "committed" || batch.status === "undone") {
    redirect(`/imports/${batchId}/review`);
  }

  const now = new Date().toISOString();
  const rowsToUpdate =
    action === "approve" || action === "approve_duplicates"
      ? await loadRowsForBulkApproval({
          userId: user.id,
          batchId,
          rowIds,
          allowDuplicateOverride: action === "approve_duplicates"
        })
      : rowIds.map((id) => ({
          id,
          status: action === "skip" ? "skipped" : "needs_review",
          error_code: null,
          error_message: null,
          reviewed_at: now
        }));

  await Promise.all(
    rowsToUpdate.map((row) =>
      admin.from("staged_transactions").update(row).eq("id", row.id).eq("user_id", user.id)
    )
  );

  await refreshImportBatchCounts(batchId, user.id);
  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}/review`);
}

async function findExistingDuplicateCandidates(input: {
  userId: string;
  accountId: string | null;
  duplicateKeys: string[];
}): Promise<Map<string, string>> {
  const uniqueKeys = Array.from(new Set(input.duplicateKeys));

  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const admin = createServiceRoleClient();
  let query = admin
    .from("transactions")
    .select("id,duplicate_key")
    .eq("user_id", input.userId)
    .in("duplicate_key", uniqueKeys)
    .is("deleted_at", null);

  if (input.accountId) {
    query = query.eq("account_id", input.accountId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [String(row.duplicate_key), String(row.id)]));
}

async function protectEditedRowFromAccidentalDuplicate(input: {
  userId: string;
  batchId: string;
  rowId: string;
  row: ReturnType<typeof validateStagedRow>;
}): Promise<ReturnType<typeof validateStagedRow>> {
  if (input.row.status !== "approved" || !input.row.duplicate_key) {
    return input.row;
  }

  const admin = createServiceRoleClient();
  const [{ data: existingTransactions, error: transactionError }, { data: stagedMatches, error: stagedError }] =
    await Promise.all([
      admin
        .from("transactions")
        .select("id")
        .eq("user_id", input.userId)
        .eq("duplicate_key", input.row.duplicate_key)
        .is("deleted_at", null)
        .limit(1),
      admin
        .from("staged_transactions")
        .select("id")
        .eq("user_id", input.userId)
        .eq("import_batch_id", input.batchId)
        .eq("duplicate_key", input.row.duplicate_key)
        .neq("id", input.rowId)
        .in("status", ["approved", "committed"])
        .limit(1)
    ]);

  if (transactionError) {
    throw transactionError;
  }

  if (stagedError) {
    throw stagedError;
  }

  const duplicateTransactionId = existingTransactions?.[0]?.id
    ? String(existingTransactions[0].id)
    : null;

  if (!duplicateTransactionId && (stagedMatches ?? []).length === 0) {
    return input.row;
  }

  return {
    ...input.row,
    duplicate_candidate_transaction_id: duplicateTransactionId,
    status: "duplicate",
    error_code: duplicateTransactionId ? "duplicate_existing_transaction" : "duplicate_in_file",
    error_message: duplicateTransactionId
      ? "Duplicate candidate already exists"
      : "Duplicate candidate within this import"
  };
}

async function loadRowsForBulkApproval(input: {
  userId: string;
  batchId: string;
  rowIds: string[];
  allowDuplicateOverride: boolean;
}) {
  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from("staged_transactions")
    .select(
      "id,account_id,transaction_date,posted_date,description_raw,amount,currency,direction,status,duplicate_key,duplicate_candidate_transaction_id"
    )
    .eq("user_id", input.userId)
    .eq("import_batch_id", input.batchId)
    .in("id", input.rowIds);

  if (error) {
    throw error;
  }

  const now = new Date().toISOString();

  return (rows ?? []).map((row) => {
    if (
      (row.status === "duplicate" || row.duplicate_candidate_transaction_id) &&
      input.allowDuplicateOverride
    ) {
      return {
        id: row.id,
        status: "approved",
        duplicate_key: row.duplicate_key ? `${row.duplicate_key}|override:${String(row.id).slice(0, 8)}` : null,
        duplicate_candidate_transaction_id: null,
        error_code: null,
        error_message: null,
        reviewed_at: now
      };
    }

    const validated = validateStagedRow({
      id: row.id,
      accountId: row.account_id,
      transactionDate: row.transaction_date,
      postedDate: row.posted_date,
      descriptionRaw: row.description_raw,
      amount: row.amount === null ? null : Number(row.amount),
      currency: row.currency,
      direction: getDirectionValue(row.direction),
      status: row.status === "duplicate" ? "duplicate" : "approved",
      duplicateCandidateTransactionId: row.duplicate_candidate_transaction_id
    });

    return {
      id: row.id,
      ...validated,
      status:
        row.status === "duplicate" || row.duplicate_candidate_transaction_id
          ? "duplicate"
          : validated.status
    };
  });
}

async function refreshImportBatchCounts(batchId: string, userId: string) {
  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from("staged_transactions")
    .select("status,error_code")
    .eq("import_batch_id", batchId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const counts = calculateStagedStatusCounts(rows ?? []);
  const { error: updateError } = await admin
    .from("import_batches")
    .update({
      staged_rows: counts.total,
      approved_rows: counts.approved,
      committed_rows: counts.committed,
      skipped_rows: counts.skipped,
      duplicate_rows: counts.duplicate,
      error_rows: counts.invalid + counts.needs_review
    })
    .eq("id", batchId)
    .eq("user_id", userId);

  if (updateError) {
    throw updateError;
  }
}

function readMappingFromForm(formData: FormData): ImportColumnMapping {
  return {
    date: getOptionalMapping(formData, "mapping_date"),
    postedDate: getOptionalMapping(formData, "mapping_postedDate"),
    description: getOptionalMapping(formData, "mapping_description"),
    amount: getOptionalMapping(formData, "mapping_amount"),
    debit: getOptionalMapping(formData, "mapping_debit"),
    credit: getOptionalMapping(formData, "mapping_credit"),
    balance: getOptionalMapping(formData, "mapping_balance"),
    currency: getOptionalMapping(formData, "mapping_currency")
  };
}

function getOptionalMapping(formData: FormData, field: string): string | undefined {
  return getTextField(formData, field) || undefined;
}

function assertSupportedFile(fileName: string) {
  const lower = fileName.toLowerCase();

  if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) {
    throw new Error("Only CSV and XLSX uploads are supported.");
  }
}

function contentTypeFromName(fileName: string): string {
  return fileName.toLowerCase().endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
}

function makeSafeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function getTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function getNumberField(formData: FormData, field: string): number | null {
  const value = getTextField(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDirectionField(
  formData: FormData,
  field: string
): "income" | "expense" | "transfer" | null {
  return getDirectionValue(getTextField(formData, field));
}

function getDirectionValue(value: unknown): "income" | "expense" | "transfer" | null {
  return value === "income" || value === "expense" || value === "transfer" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
