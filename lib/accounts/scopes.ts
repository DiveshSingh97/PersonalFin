import type { FinancialAccount } from "@/lib/db/types";

export type FinancialScope = {
  id: string;
  label: string;
  description: string;
  accountIds: string[];
};

const typeLabels: Record<string, string> = {
  bank: "Bank accounts",
  credit_card: "Credit cards",
  investment: "Investments",
  crypto: "Crypto",
  debt: "Debt"
};

export function buildFinancialScopes(accounts: FinancialAccount[]): FinancialScope[] {
  const activeAccounts = accounts.filter((account) => account.is_active);
  const scopes: FinancialScope[] = [
    {
      id: "total",
      label: "Total",
      description: "All active accounts",
      accountIds: activeAccounts.map((account) => account.id)
    }
  ];

  Object.entries(typeLabels).forEach(([type, label]) => {
    const matchingAccounts = activeAccounts.filter((account) => account.account_type === type);
    if (matchingAccounts.length > 0) {
      scopes.push({
        id: `type:${type}`,
        label,
        description: `${matchingAccounts.length} active ${label.toLowerCase()}`,
        accountIds: matchingAccounts.map((account) => account.id)
      });
    }
  });

  getProviders(activeAccounts).forEach((provider) => {
    const providerAccounts = activeAccounts.filter(
      (account) => providerKey(account.institution_name) === provider.key
    );
    const providerNonCards = providerAccounts.filter((account) => account.account_type !== "credit_card");
    const providerCards = activeAccounts.filter(
      (account) =>
        account.account_type === "credit_card" &&
        (providerKey(account.institution_name) === provider.key ||
          providerNonCards.some((parent) => parent.id === account.parent_account_id))
    );
    const providerWithCards = uniqueAccounts([...providerAccounts, ...providerCards]);

    if (providerWithCards.length > 0) {
      scopes.push({
        id: `provider:${provider.key}:with_cards`,
        label: provider.name,
        description: "Provider including linked credit cards",
        accountIds: providerWithCards.map((account) => account.id)
      });
    }

    if (providerNonCards.length > 0) {
      scopes.push({
        id: `provider:${provider.key}:no_cards`,
        label: `${provider.name} excluding credit cards`,
        description: "Provider bank accounts and non-card accounts",
        accountIds: providerNonCards.map((account) => account.id)
      });
    }

    if (providerCards.length > 0) {
      scopes.push({
        id: `provider:${provider.key}:cards`,
        label: `${provider.name} credit cards only`,
        description: "Credit cards linked to this provider",
        accountIds: providerCards.map((account) => account.id)
      });
    }
  });

  activeAccounts.forEach((account) => {
    scopes.push({
      id: `account:${account.id}`,
      label: account.name,
      description: `${account.institution_name || "No provider"} · ${account.account_type.replace("_", " ")}`,
      accountIds: [account.id]
    });
  });

  return scopes;
}

export function resolveFinancialScope(
  accounts: FinancialAccount[],
  scopeId: string | null | undefined
): FinancialScope {
  const scopes = buildFinancialScopes(accounts);
  return scopes.find((scope) => scope.id === scopeId) ?? scopes[0] ?? {
    id: "total",
    label: "Total",
    description: "All active accounts",
    accountIds: []
  };
}

function getProviders(accounts: FinancialAccount[]): Array<{ key: string; name: string }> {
  const providers = new Map<string, string>();

  accounts.forEach((account) => {
    const key = providerKey(account.institution_name);
    if (key) {
      providers.set(key, account.institution_name?.trim() ?? key);
    }
  });

  return Array.from(providers.entries())
    .map(([key, name]) => ({ key, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function providerKey(value: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, "-") ?? "";
}

function uniqueAccounts(accounts: FinancialAccount[]): FinancialAccount[] {
  return Array.from(new Map(accounts.map((account) => [account.id, account])).values());
}
