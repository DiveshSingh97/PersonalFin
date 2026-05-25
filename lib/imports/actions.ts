"use server";

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/db/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { parseImportFile } from "@/lib/imports/parser";

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

  const approvedRows = (stagedRows ?? []).filter(
    (row) =>
      row.account_id &&
      row.transaction_date &&
      row.description_raw &&
      row.amount !== null &&
      row.direction
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
