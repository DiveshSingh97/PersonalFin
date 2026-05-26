import { describe, expect, it } from "vitest";
import {
  applyDuplicateStatuses,
  calculateStagedStatusCounts,
  mapRawRowWithMapping,
  validateStagedRow
} from "@/lib/imports/review";

describe("import review helpers", () => {
  it("maps raw rows with updated column mapping", () => {
    const row = mapRawRowWithMapping({
      accountId: "account-1",
      defaultCurrency: "ZAR",
      mapping: {
        date: "Date",
        description: "Details",
        amount: "Value",
        balance: "Balance"
      },
      rawRow: {
        Date: "2026/05/25",
        Details: "Synthetic salary",
        Value: "1200.00",
        Balance: "1200.00"
      }
    });

    expect(row).toMatchObject({
      transaction_date: "2026-05-25",
      description_raw: "Synthetic salary",
      amount: 1200,
      currency: "ZAR",
      direction: "income",
      status: "approved",
      error_message: null
    });
  });

  it("revalidates approved row edits and recomputes duplicate keys", () => {
    const valid = validateStagedRow({
      accountId: "account-1",
      transactionDate: "2026-05-25",
      postedDate: null,
      descriptionRaw: "Synthetic groceries",
      amount: -42.25,
      currency: "zar",
      direction: "expense",
      status: "approved"
    });

    expect(valid.status).toBe("approved");
    expect(valid.currency).toBe("ZAR");
    expect(valid.duplicate_key).toContain("account-1|2026-05-25|-42.25|synthetic groceries");
  });

  it("marks approved edits invalid when required fields are missing", () => {
    const invalid = validateStagedRow({
      accountId: "account-1",
      transactionDate: null,
      postedDate: null,
      descriptionRaw: "",
      amount: null,
      currency: "ZAR",
      direction: "expense",
      status: "approved"
    });

    expect(invalid.status).toBe("invalid");
    expect(invalid.error_message).toContain("Transaction date is required");
    expect(invalid.error_message).toContain("Description is required");
    expect(invalid.error_message).toContain("Amount is required");
  });

  it("marks repeated duplicate keys as duplicate candidates", () => {
    const rows = [
      validateStagedRow({
        accountId: "account-1",
        transactionDate: "2026-05-25",
        postedDate: null,
        descriptionRaw: "Synthetic transfer",
        amount: 300,
        currency: "ZAR",
        direction: "income",
        status: "approved"
      }),
      validateStagedRow({
        accountId: "account-1",
        transactionDate: "2026-05-25",
        postedDate: null,
        descriptionRaw: "Synthetic transfer",
        amount: 300,
        currency: "ZAR",
        direction: "income",
        status: "approved"
      })
    ];

    const result = applyDuplicateStatuses(rows, new Set());

    expect(result[0].status).toBe("approved");
    expect(result[1]).toMatchObject({
      status: "duplicate",
      error_code: "duplicate_in_file"
    });
  });

  it("counts staged statuses for batch summaries", () => {
    const counts = calculateStagedStatusCounts([
      { status: "approved" },
      { status: "invalid" },
      { status: "duplicate" },
      { status: "skipped" },
      { status: "needs_review" },
      { status: "committed" }
    ]);

    expect(counts).toMatchObject({
      total: 6,
      approved: 1,
      invalid: 1,
      duplicate: 1,
      skipped: 1,
      needs_review: 1,
      committed: 1,
      requiringReview: 2
    });
  });
});
