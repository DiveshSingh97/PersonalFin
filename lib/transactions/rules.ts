import { buildMerchantKey, normalizeMerchantDescription } from "@/lib/transactions/merchant-normalization";

export type TransactionRule = {
  id?: string;
  name?: string | null;
  match_type: string;
  pattern: string | null;
  category_id: string | null;
  direction: "income" | "expense" | "transfer" | null;
  is_subscription: boolean | null;
  is_transfer: boolean | null;
  priority: number;
  is_active: boolean;
  created_at?: string | null;
};

export type RuleTransaction = {
  description_raw: string;
  description_clean: string | null;
  direction: "income" | "expense" | "transfer";
};

export function findMatchingRule(
  transaction: RuleTransaction,
  rules: TransactionRule[]
): TransactionRule | null {
  const sortedRules = [...rules].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return (left.created_at ?? "").localeCompare(right.created_at ?? "");
  });

  return sortedRules.find((rule) => doesRuleMatchTransaction(rule, transaction)) ?? null;
}

export function doesRuleMatchTransaction(
  rule: TransactionRule,
  transaction: RuleTransaction
): boolean {
  if (!rule.is_active || !rule.pattern?.trim()) {
    return false;
  }

  if (rule.direction && rule.direction !== transaction.direction) {
    return false;
  }

  const merchant = normalizeMerchantDescription(
    transaction.description_clean || transaction.description_raw
  );
  const pattern = rule.pattern.trim();
  const normalizedPattern = normalizeMatchText(pattern);
  const merchantPattern = buildMerchantKey(pattern);
  const haystacks = [
    transaction.description_raw,
    transaction.description_clean ?? "",
    merchant.cleanedDescription,
    merchant.displayName,
    merchant.normalizedKey
  ].map(normalizeMatchText);

  if (rule.match_type === "exact") {
    return haystacks.some(
      (value) => value === normalizedPattern || buildMerchantKey(value) === merchantPattern
    );
  }

  if (rule.match_type === "regex") {
    try {
      const regex = new RegExp(pattern, "i");
      return haystacks.some((value) => regex.test(value));
    } catch {
      return false;
    }
  }

  return haystacks.some(
    (value) => value.includes(normalizedPattern) || buildMerchantKey(value).includes(merchantPattern)
  );
}

export function normalizeMatchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
