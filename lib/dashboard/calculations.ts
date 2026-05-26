export type DashboardTransaction = {
  id: string;
  transaction_date: string;
  amount: number;
  currency: string;
  direction: "income" | "expense" | "transfer";
  category_id: string | null;
  category_name: string | null;
  merchant_display_name: string;
  account_name?: string;
  description?: string;
  import_batch_id?: string | null;
};

export type DashboardSummary = {
  income: number;
  expenses: number;
  netCashFlow: number;
  transactionCount: number;
  uncategorizedCount: number;
  activeAccountCount: number;
};

export type MonthlyCashFlow = {
  month: string;
  income: number;
  expenses: number;
  netCashFlow: number;
};

export type CategorySpending = {
  category: string;
  total: number;
  transactionCount: number;
  percentage: number;
};

export type MerchantSpending = {
  merchant: string;
  total: number;
  transactionCount: number;
  topCategory: string;
};

export function calculateDashboardSummary(
  transactions: DashboardTransaction[],
  activeAccountCount: number
): DashboardSummary {
  const income = sumIncome(transactions);
  const expenses = sumExpenses(transactions);

  return {
    income,
    expenses,
    netCashFlow: roundMoney(income - expenses),
    transactionCount: transactions.length,
    uncategorizedCount: transactions.filter(isUncategorized).length,
    activeAccountCount
  };
}

export function groupMonthlyCashFlow(transactions: DashboardTransaction[]): MonthlyCashFlow[] {
  const groups = new Map<string, { income: number; expenses: number }>();

  transactions.forEach((transaction) => {
    const month = transaction.transaction_date.slice(0, 7);
    const existing = groups.get(month) ?? { income: 0, expenses: 0 };

    if (transaction.direction === "income") {
      existing.income += Math.abs(transaction.amount);
    }

    if (transaction.direction === "expense") {
      existing.expenses += Math.abs(transaction.amount);
    }

    groups.set(month, existing);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, values]) => ({
      month,
      income: roundMoney(values.income),
      expenses: roundMoney(values.expenses),
      netCashFlow: roundMoney(values.income - values.expenses)
    }));
}

export function groupSpendingByCategory(transactions: DashboardTransaction[]): CategorySpending[] {
  const expenses = transactions.filter((transaction) => transaction.direction === "expense");
  const totalExpenses = sumExpenses(expenses);
  const groups = new Map<string, { total: number; transactionCount: number }>();

  expenses.forEach((transaction) => {
    const category = displayCategory(transaction);
    const existing = groups.get(category) ?? { total: 0, transactionCount: 0 };
    existing.total += Math.abs(transaction.amount);
    existing.transactionCount += 1;
    groups.set(category, existing);
  });

  return Array.from(groups.entries())
    .map(([category, values]) => ({
      category,
      total: roundMoney(values.total),
      transactionCount: values.transactionCount,
      percentage: totalExpenses > 0 ? roundMoney((values.total / totalExpenses) * 100) : 0
    }))
    .sort((left, right) => right.total - left.total);
}

export function groupTopMerchants(transactions: DashboardTransaction[]): MerchantSpending[] {
  const groups = new Map<
    string,
    { total: number; transactionCount: number; categories: Map<string, number> }
  >();

  transactions
    .filter((transaction) => transaction.direction === "expense")
    .forEach((transaction) => {
      const merchant = transaction.merchant_display_name || "Unknown merchant";
      const category = displayCategory(transaction);
      const existing =
        groups.get(merchant) ?? { total: 0, transactionCount: 0, categories: new Map<string, number>() };

      existing.total += Math.abs(transaction.amount);
      existing.transactionCount += 1;
      existing.categories.set(category, (existing.categories.get(category) ?? 0) + 1);
      groups.set(merchant, existing);
    });

  return Array.from(groups.entries())
    .map(([merchant, values]) => ({
      merchant,
      total: roundMoney(values.total),
      transactionCount: values.transactionCount,
      topCategory: topCategory(values.categories)
    }))
    .sort((left, right) => right.total - left.total);
}

export function getMonthRange(month: string): { start: string; endExclusive: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: end.toISOString().slice(0, 10)
  };
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function isMonthValue(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function sumIncome(transactions: DashboardTransaction[]): number {
  return roundMoney(
    transactions
      .filter((transaction) => transaction.direction === "income")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
  );
}

function sumExpenses(transactions: DashboardTransaction[]): number {
  return roundMoney(
    transactions
      .filter((transaction) => transaction.direction === "expense")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
  );
}

function displayCategory(transaction: DashboardTransaction): string {
  if (!transaction.category_id || transaction.category_name?.toLowerCase() === "unknown") {
    return "Uncategorized / Unknown";
  }

  return transaction.category_name ?? "Uncategorized / Unknown";
}

function isUncategorized(transaction: DashboardTransaction): boolean {
  return !transaction.category_id || transaction.category_name?.toLowerCase() === "unknown";
}

function topCategory(categories: Map<string, number>): string {
  return (
    Array.from(categories.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "Uncategorized / Unknown"
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
