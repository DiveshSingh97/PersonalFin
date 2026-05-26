"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/db/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeMerchantDescription } from "@/lib/transactions/merchant-normalization";
import { findMatchingRule, type RuleTransaction, type TransactionRule } from "@/lib/transactions/rules";

const supportedMatchTypes = new Set(["contains", "exact"]);
const supportedDirections = new Set(["income", "expense", "transfer"]);

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type CleanupTransaction = RuleTransaction & {
  id: string;
  user_id: string;
  category_id: string | null;
  merchant_id: string | null;
};

type MerchantRecord = {
  id: string;
  canonical_name: string;
  normalized_key: string;
  category_id: string | null;
};

export async function updateTransactionCategoryAction(formData: FormData) {
  const returnTo = getReturnTo(formData);
  let targetUrl: string;

  try {
    const user = await requireCurrentUser();
    const transactionId = getTextField(formData, "transaction_id");
    const categoryId = await resolveReadableCategoryId(user.id, getTextField(formData, "category_id"));

    if (!transactionId) {
      throw new Error("Transaction is required.");
    }

    const admin = createServiceRoleClient();
    const transaction = await loadActiveTransaction(admin, user.id, transactionId);
    const merchant = await ensureMerchantForTransaction(admin, user.id, transaction, categoryId);

    const { error } = await admin
      .from("transactions")
      .update({
        category_id: categoryId,
        merchant_id: merchant.id,
        user_verified: true
      })
      .eq("id", transaction.id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (error) {
      throw error;
    }

    revalidatePath("/transactions");
    targetUrl = withFeedback(returnTo, "success", "Category updated.");
  } catch (error) {
    targetUrl = withFeedback(
      returnTo,
      "error",
      `Could not update category: ${safeErrorMessage(error)}`
    );
  }

  redirect(targetUrl);
}

export async function createTransactionRuleAction(formData: FormData) {
  const returnTo = getReturnTo(formData);
  let targetUrl: string;

  try {
    const user = await requireCurrentUser();
    const admin = createServiceRoleClient();
    const transactionId = getTextField(formData, "transaction_id");
    const transaction = transactionId
      ? await loadActiveTransaction(admin, user.id, transactionId)
      : null;
    const merchant = transaction
      ? normalizeMerchantDescription(transaction.description_clean || transaction.description_raw)
      : null;
    const pattern = getTextField(formData, "pattern") || merchant?.displayName || null;
    const categoryId = await resolveReadableCategoryId(user.id, getTextField(formData, "category_id"));
    const matchType = getTextField(formData, "match_type") || "contains";
    const direction = normalizeOptionalDirection(getTextField(formData, "direction"));
    const priority = normalizePriority(getTextField(formData, "priority"));

    if (!pattern) {
      throw new Error("Rule pattern is required.");
    }

    if (!supportedMatchTypes.has(matchType)) {
      throw new Error("Rules currently support contains or exact matching.");
    }

    if (!categoryId && !isChecked(formData, "is_subscription") && !isChecked(formData, "is_transfer")) {
      throw new Error("Choose a category or a flag for this rule.");
    }

    const { data: rule, error } = await admin
      .from("transaction_rules")
      .insert({
        user_id: user.id,
        name: getTextField(formData, "name") || `${pattern} cleanup`,
        match_type: matchType,
        pattern,
        category_id: categoryId,
        direction,
        is_subscription: isChecked(formData, "is_subscription") ? true : null,
        is_transfer: isChecked(formData, "is_transfer") ? true : null,
        priority,
        is_active: true
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    let message = "Rule saved.";

    if (transaction && rule?.id) {
      const result = await applyRulesToTransactions({
        userId: user.id,
        transactionId: transaction.id,
        onlyUncategorized: false
      });
      message =
        result.updated > 0
          ? `Rule saved and applied to ${result.updated} transaction.`
          : "Rule saved. No matching transaction update was needed.";
    }

    revalidatePath("/transactions");
    targetUrl = withFeedback(returnTo, "success", message);
  } catch (error) {
    targetUrl = withFeedback(returnTo, "error", `Could not save rule: ${safeErrorMessage(error)}`);
  }

  redirect(targetUrl);
}

export async function applyTransactionRulesAction(formData: FormData) {
  const returnTo = getReturnTo(formData);
  let targetUrl: string;

  try {
    const user = await requireCurrentUser();
    const transactionId = getTextField(formData, "transaction_id");
    const result = await applyRulesToTransactions({
      userId: user.id,
      transactionId,
      onlyUncategorized: !transactionId
    });

    const scope = transactionId ? "transaction" : "uncategorized transactions";
    const message =
      result.updated > 0
        ? `Applied rules to ${result.updated} ${result.updated === 1 ? "transaction" : "transactions"}.`
        : `No matching ${scope} found.`;

    revalidatePath("/transactions");
    targetUrl = withFeedback(returnTo, "success", message);
  } catch (error) {
    targetUrl = withFeedback(returnTo, "error", `Could not apply rule: ${safeErrorMessage(error)}`);
  }

  redirect(targetUrl);
}

export async function applyRulesToTransactions(input: {
  userId: string;
  transactionId?: string | null;
  importBatchId?: string | null;
  onlyUncategorized?: boolean;
}) {
  const admin = createServiceRoleClient();
  const rules = await loadActiveRules(admin, input.userId);

  if (rules.length === 0) {
    return { matched: 0, updated: 0 };
  }

  let query = admin
    .from("transactions")
    .select("id,user_id,description_raw,description_clean,direction,category_id,merchant_id")
    .eq("user_id", input.userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(input.transactionId ? 1 : 500);

  if (input.transactionId) {
    query = query.eq("id", input.transactionId);
  }

  if (input.importBatchId) {
    query = query.eq("import_batch_id", input.importBatchId);
  }

  if (input.onlyUncategorized) {
    const unknownCategoryId = await findUnknownCategoryId(admin, input.userId);
    query = unknownCategoryId
      ? query.or(`category_id.is.null,category_id.eq.${unknownCategoryId}`)
      : query.is("category_id", null);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  let matched = 0;
  let updated = 0;

  for (const transaction of ((data ?? []) as CleanupTransaction[])) {
    const rule = findMatchingRule(transaction, rules);

    if (!rule) {
      continue;
    }

    matched += 1;
    const merchant = await ensureMerchantForTransaction(
      admin,
      input.userId,
      transaction,
      rule.category_id
    );
    const updates: Record<string, unknown> = {
      merchant_id: merchant.id,
      user_verified: true
    };

    if (rule.category_id) {
      updates.category_id = rule.category_id;
    }

    if (rule.is_subscription !== null) {
      updates.is_subscription = rule.is_subscription;
    }

    if (rule.is_transfer !== null) {
      updates.is_transfer = rule.is_transfer;
    }

    const { error: updateError } = await admin
      .from("transactions")
      .update(updates)
      .eq("id", transaction.id)
      .eq("user_id", input.userId)
      .is("deleted_at", null);

    if (updateError) {
      throw updateError;
    }

    updated += 1;
  }

  return { matched, updated };
}

async function loadActiveRules(admin: AdminClient, userId: string): Promise<TransactionRule[]> {
  const { data, error } = await admin
    .from("transaction_rules")
    .select(
      "id,name,match_type,pattern,category_id,direction,is_subscription,is_transfer,priority,is_active,created_at"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as TransactionRule[];
}

async function loadActiveTransaction(
  admin: AdminClient,
  userId: string,
  transactionId: string
): Promise<CleanupTransaction> {
  const { data, error } = await admin
    .from("transactions")
    .select("id,user_id,description_raw,description_clean,direction,category_id,merchant_id")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (error) {
    throw error;
  }

  return data as CleanupTransaction;
}

async function ensureMerchantForTransaction(
  admin: AdminClient,
  userId: string,
  transaction: RuleTransaction,
  categoryId: string | null
): Promise<MerchantRecord> {
  const merchant = normalizeMerchantDescription(
    transaction.description_clean || transaction.description_raw
  );
  const { data: existing, error: lookupError } = await admin
    .from("merchants")
    .select("id,canonical_name,normalized_key,category_id")
    .eq("user_id", userId)
    .eq("normalized_key", merchant.normalizedKey)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    if (categoryId && existing.category_id !== categoryId) {
      const { data: updated, error: updateError } = await admin
        .from("merchants")
        .update({
          canonical_name: merchant.displayName,
          category_id: categoryId
        })
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("id,canonical_name,normalized_key,category_id")
        .single();

      if (updateError) {
        throw updateError;
      }

      return updated as MerchantRecord;
    }

    return existing as MerchantRecord;
  }

  const { data: inserted, error: insertError } = await admin
    .from("merchants")
    .insert({
      user_id: userId,
      canonical_name: merchant.displayName,
      normalized_key: merchant.normalizedKey,
      category_id: categoryId
    })
    .select("id,canonical_name,normalized_key,category_id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted as MerchantRecord;
}

async function resolveReadableCategoryId(
  userId: string,
  categoryId: string | null
): Promise<string | null> {
  if (!categoryId) {
    return null;
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("transaction_categories")
    .select("id")
    .eq("id", categoryId)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Choose a valid category.");
  }

  return String(data.id);
}

async function findUnknownCategoryId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("transaction_categories")
    .select("id")
    .eq("slug", "unknown")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("user_id", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ? String(data.id) : null;
}

function getTextField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() || null : null;
}

function isChecked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function normalizeOptionalDirection(value: string | null): "income" | "expense" | "transfer" | null {
  return value && supportedDirections.has(value) ? (value as "income" | "expense" | "transfer") : null;
}

function normalizePriority(value: string | null): number {
  if (!value) {
    return 100;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 100;
}

function getReturnTo(formData: FormData): string {
  const value = getTextField(formData, "return_to");

  if (!value || !value.startsWith("/transactions")) {
    return "/transactions";
  }

  return value;
}

function withFeedback(returnTo: string, type: "success" | "error", message: string): string {
  const [path, query = ""] = returnTo.split("?");
  const params = new URLSearchParams(query);
  params.set("notice", type);
  params.set("message", message);
  return `${path}?${params.toString()}`;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unexpected error";
  }

  return error.message.replace(/\s+/g, " ").slice(0, 160);
}
