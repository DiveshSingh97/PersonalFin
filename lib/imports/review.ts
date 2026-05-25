import type { ImportColumnMapping } from "@/lib/imports/parser";
import { buildDuplicateKey, normalizeDescription } from "@/lib/imports/parser";

export const stagedStatuses = [
  "approved",
  "invalid",
  "duplicate",
  "skipped",
  "committed",
  "needs_review"
] as const;

export type StagedStatus = (typeof stagedStatuses)[number];

export type EditableStagedRowInput = {
  id?: string;
  accountId: string | null;
  rawRow?: Record<string, unknown>;
  transactionDate: string | null;
  postedDate: string | null;
  descriptionRaw: string | null;
  amount: number | null;
  currency: string | null;
  direction: "income" | "expense" | "transfer" | null;
  status: StagedStatus;
  duplicateCandidateTransactionId?: string | null;
};

export type ValidatedStagedRow = {
  transaction_date: string | null;
  posted_date: string | null;
  description_raw: string | null;
  description_clean: string | null;
  amount: number | null;
  currency: string | null;
  direction: "income" | "expense" | "transfer" | null;
  duplicate_key: string | null;
  duplicate_candidate_transaction_id?: string | null;
  status: StagedStatus;
  error_code: string | null;
  error_message: string | null;
  reviewed_at?: string | null;
};

export type StagedStatusCounts = Record<StagedStatus, number> & {
  total: number;
  parseErrors: number;
  duplicates: number;
  requiringReview: number;
};

const directions = new Set(["income", "expense", "transfer"]);

export function validateStagedRow(input: EditableStagedRowInput): ValidatedStagedRow {
  const transactionDate = normalizeDate(input.transactionDate);
  const postedDate = normalizeDate(input.postedDate);
  const descriptionRaw = cleanNullable(input.descriptionRaw);
  const descriptionClean = descriptionRaw ? normalizeDescription(descriptionRaw) : null;
  const amount = normalizeAmount(input.amount);
  const currency = normalizeCurrency(input.currency);
  const direction = normalizeDirection(input.direction);
  const requestedStatus = normalizeStatus(input.status);
  const duplicateKey =
    input.accountId && transactionDate && descriptionClean && amount !== null
      ? buildDuplicateKey({
          accountId: input.accountId,
          transactionDate,
          amount,
          descriptionClean
        })
      : null;

  const errors =
    requestedStatus === "approved"
      ? [
          transactionDate ? null : "Transaction date is required for approved rows",
          descriptionRaw ? null : "Description is required for approved rows",
          amount !== null ? null : "Amount is required for approved rows",
          direction ? null : "Direction must be income, expense, or transfer",
          currency ? null : "Currency must be a three-letter code"
        ].filter((error): error is string => Boolean(error))
      : [
          input.currency && !currency ? "Currency must be a three-letter code" : null,
          input.direction && !direction ? "Direction must be income, expense, or transfer" : null,
          input.transactionDate && !transactionDate ? "Transaction date is invalid" : null,
          input.postedDate && !postedDate ? "Posted date is invalid" : null
        ].filter((error): error is string => Boolean(error));

  const status: StagedStatus = errors.length > 0 ? "invalid" : requestedStatus;

  return {
    transaction_date: transactionDate,
    posted_date: postedDate,
    description_raw: descriptionRaw,
    description_clean: descriptionClean,
    amount,
    currency,
    direction,
    duplicate_key: duplicateKey,
    duplicate_candidate_transaction_id: input.duplicateCandidateTransactionId ?? null,
    status,
    error_code: errors.length > 0 ? "validation_error" : null,
    error_message: errors.join("; ") || null,
    reviewed_at: new Date().toISOString()
  };
}

export function mapRawRowWithMapping(input: {
  rawRow: Record<string, unknown>;
  mapping: ImportColumnMapping;
  accountId: string | null;
  defaultCurrency: string;
  duplicateCandidateTransactionId?: string | null;
}): ValidatedStagedRow {
  const debit = parseMoney(getMappedValue(input.rawRow, input.mapping.debit));
  const credit = parseMoney(getMappedValue(input.rawRow, input.mapping.credit));
  const signedAmount = resolveSignedAmount({
    amount: getMappedValue(input.rawRow, input.mapping.amount),
    debit,
    credit
  });

  const validated = validateStagedRow({
    accountId: input.accountId,
    rawRow: input.rawRow,
    transactionDate: getMappedValue(input.rawRow, input.mapping.date),
    postedDate: getMappedValue(input.rawRow, input.mapping.postedDate),
    descriptionRaw: getMappedValue(input.rawRow, input.mapping.description),
    amount: signedAmount.amount,
    currency: getMappedValue(input.rawRow, input.mapping.currency) || input.defaultCurrency,
    direction: signedAmount.direction,
    status: signedAmount.error ? "invalid" : "approved",
    duplicateCandidateTransactionId: input.duplicateCandidateTransactionId ?? null
  });

  if (!signedAmount.error) {
    return validated;
  }

  return {
    ...validated,
    status: "invalid",
    error_code: "parse_error",
    error_message: signedAmount.error
  };
}

export function applyDuplicateStatuses<T extends ValidatedStagedRow>(
  rows: T[],
  existingDuplicateKeys: Set<string>,
  duplicateCandidateIds: Map<string, string> = new Map()
): T[] {
  const seenKeys = new Set<string>();

  return rows.map((row) => {
    if (!row.duplicate_key || row.status !== "approved") {
      return row;
    }

    const existingId = duplicateCandidateIds.get(row.duplicate_key);
    const isDuplicate = seenKeys.has(row.duplicate_key) || existingDuplicateKeys.has(row.duplicate_key);
    seenKeys.add(row.duplicate_key);

    if (!isDuplicate && !existingId) {
      return row;
    }

    return {
      ...row,
      duplicate_candidate_transaction_id: existingId ?? row.duplicate_candidate_transaction_id ?? null,
      status: "duplicate",
      error_code: existingId ? "duplicate_existing_transaction" : "duplicate_in_file",
      error_message: existingId
        ? "Duplicate candidate already exists"
        : "Duplicate candidate within this file"
    };
  });
}

export function calculateStagedStatusCounts(
  rows: Array<{ status: string; error_code?: string | null }>
): StagedStatusCounts {
  const counts = {
    approved: 0,
    invalid: 0,
    duplicate: 0,
    skipped: 0,
    committed: 0,
    needs_review: 0,
    total: rows.length,
    parseErrors: 0,
    duplicates: 0,
    requiringReview: 0
  };

  rows.forEach((row) => {
    const status = normalizeStatus(row.status);
    counts[status] += 1;
    counts.parseErrors += status === "invalid" ? 1 : 0;
    counts.duplicates += status === "duplicate" ? 1 : 0;
    counts.requiringReview += status === "invalid" || status === "needs_review" ? 1 : 0;
  });

  return counts;
}

export function normalizeStatus(status: string): StagedStatus {
  return stagedStatuses.includes(status as StagedStatus) ? (status as StagedStatus) : "needs_review";
}

function resolveSignedAmount(input: {
  amount: string | null;
  debit: number | null;
  credit: number | null;
}): {
  amount: number | null;
  direction: "income" | "expense" | null;
  error: string | null;
} {
  if (input.debit !== null || input.credit !== null) {
    if (input.debit !== null && input.credit !== null && input.debit !== 0 && input.credit !== 0) {
      return { amount: null, direction: null, error: "Both debit and credit contain values" };
    }

    if (input.credit !== null && input.credit !== 0) {
      return { amount: roundMoney(Math.abs(input.credit)), direction: "income", error: null };
    }

    if (input.debit !== null && input.debit !== 0) {
      return { amount: roundMoney(-Math.abs(input.debit)), direction: "expense", error: null };
    }
  }

  const amount = parseMoney(input.amount);

  if (amount === null) {
    return { amount: null, direction: null, error: "Missing or invalid amount" };
  }

  return {
    amount: roundMoney(amount),
    direction: amount < 0 ? "expense" : "income",
    error: null
  };
}

function getMappedValue(rawRow: Record<string, unknown>, header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const value = rawRow[header];
  return value === null || value === undefined ? null : String(value).trim() || null;
}

function normalizeDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const yearFirst = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
  if (yearFirst) {
    return formatDateParts(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }

  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    const year = normalizeYear(Number(dayFirst[3]));
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return formatDateParts(year, month, day);
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDateParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function normalizeYear(year: number): number {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  return year;
}

function normalizeAmount(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? roundMoney(value) : null;
}

function parseMoney(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const negative = /^\(.*\)$/.test(value) || value.trim().startsWith("-");
  const normalized = value.replace(/[(),\sA-Z$R]/gi, "").replace(/^\+/, "");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return negative ? -Math.abs(parsed) : parsed;
}

function normalizeCurrency(value: string | null): string | null {
  const currency = value?.trim().toUpperCase() || null;
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeDirection(
  value: "income" | "expense" | "transfer" | null
): "income" | "expense" | "transfer" | null {
  return value && directions.has(value) ? value : null;
}

function cleanNullable(value: string | null): string | null {
  return value?.trim() || null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
