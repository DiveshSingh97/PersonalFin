import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  getMonthRange,
  groupMonthlyCashFlow,
  groupSpendingByCategory,
  groupTopMerchants,
  shiftMonth,
  type DashboardTransaction
} from "@/lib/dashboard/calculations";

const transactions: DashboardTransaction[] = [
  {
    id: "income-1",
    transaction_date: "2026-05-01",
    amount: 1000,
    currency: "ZAR",
    direction: "income",
    category_id: "income",
    category_name: "Income",
    merchant_display_name: "Salary"
  },
  {
    id: "expense-1",
    transaction_date: "2026-05-02",
    amount: -125.5,
    currency: "ZAR",
    direction: "expense",
    category_id: "groceries",
    category_name: "Groceries",
    merchant_display_name: "Woolworths"
  },
  {
    id: "expense-2",
    transaction_date: "2026-05-03",
    amount: -199,
    currency: "ZAR",
    direction: "expense",
    category_id: null,
    category_name: null,
    merchant_display_name: "Netflix"
  },
  {
    id: "expense-3",
    transaction_date: "2026-04-25",
    amount: -50,
    currency: "ZAR",
    direction: "expense",
    category_id: "unknown",
    category_name: "Unknown",
    merchant_display_name: "Woolworths"
  }
];

describe("calculateDashboardSummary", () => {
  it("calculates income, expenses, net, and uncategorized counts", () => {
    expect(calculateDashboardSummary(transactions, 2)).toEqual({
      income: 1000,
      expenses: 374.5,
      netCashFlow: 625.5,
      transactionCount: 4,
      uncategorizedCount: 2,
      activeAccountCount: 2
    });
  });
});

describe("groupMonthlyCashFlow", () => {
  it("groups income and expenses by month", () => {
    expect(groupMonthlyCashFlow(transactions)).toEqual([
      { month: "2026-04", income: 0, expenses: 50, netCashFlow: -50 },
      { month: "2026-05", income: 1000, expenses: 324.5, netCashFlow: 675.5 }
    ]);
  });
});

describe("groupSpendingByCategory", () => {
  it("groups expenses by category and sorts by spend", () => {
    expect(groupSpendingByCategory(transactions)).toEqual([
      { category: "Uncategorized / Unknown", total: 249, transactionCount: 2, percentage: 66.49 },
      { category: "Groceries", total: 125.5, transactionCount: 1, percentage: 33.51 }
    ]);
  });
});

describe("groupTopMerchants", () => {
  it("groups expenses by merchant and keeps the top category", () => {
    expect(groupTopMerchants(transactions)).toEqual([
      {
        merchant: "Netflix",
        total: 199,
        transactionCount: 1,
        topCategory: "Uncategorized / Unknown"
      },
      {
        merchant: "Woolworths",
        total: 175.5,
        transactionCount: 2,
        topCategory: "Groceries"
      }
    ]);
  });
});

describe("month helpers", () => {
  it("builds month ranges and shifted months", () => {
    expect(getMonthRange("2026-05")).toEqual({
      start: "2026-05-01",
      endExclusive: "2026-06-01"
    });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
