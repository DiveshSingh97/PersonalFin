import { describe, expect, it } from "vitest";
import { buildFinancialScopes, resolveFinancialScope } from "@/lib/accounts/scopes";
import type { FinancialAccount } from "@/lib/db/types";

const accounts: FinancialAccount[] = [
  account({
    id: "fnb-main",
    name: "FNB Main",
    institution_name: "FNB",
    account_type: "bank",
    account_role: "primary_bank_account"
  }),
  account({
    id: "fnb-card",
    name: "FNB Credit Card",
    institution_name: "FNB",
    account_type: "credit_card",
    account_role: "credit_card",
    parent_account_id: "fnb-main"
  }),
  account({
    id: "discovery-main",
    name: "Discovery Main",
    institution_name: "Discovery",
    account_type: "bank",
    account_role: "secondary_bank_account"
  }),
  account({
    id: "crypto",
    name: "Crypto",
    institution_name: "Luno",
    account_type: "crypto",
    account_role: "crypto"
  })
];

describe("buildFinancialScopes", () => {
  it("builds total, account type, provider, and specific account scopes", () => {
    const scopes = buildFinancialScopes(accounts);
    expect(scopes.find((scope) => scope.id === "total")?.accountIds).toEqual([
      "fnb-main",
      "fnb-card",
      "discovery-main",
      "crypto"
    ]);
    expect(scopes.find((scope) => scope.id === "type:bank")?.accountIds).toEqual([
      "fnb-main",
      "discovery-main"
    ]);
    expect(scopes.find((scope) => scope.id === "type:credit_card")?.accountIds).toEqual(["fnb-card"]);
    expect(scopes.find((scope) => scope.id === "provider:fnb:with_cards")?.accountIds).toEqual([
      "fnb-main",
      "fnb-card"
    ]);
    expect(scopes.find((scope) => scope.id === "provider:fnb:no_cards")?.accountIds).toEqual([
      "fnb-main"
    ]);
    expect(scopes.find((scope) => scope.id === "provider:fnb:cards")?.accountIds).toEqual([
      "fnb-card"
    ]);
    expect(scopes.find((scope) => scope.id === "account:fnb-main")?.accountIds).toEqual([
      "fnb-main"
    ]);
  });

  it("falls back to total for unknown scopes", () => {
    expect(resolveFinancialScope(accounts, "missing").id).toBe("total");
  });
});

function account(input: Partial<FinancialAccount> & Pick<FinancialAccount, "id" | "name">): FinancialAccount {
  return {
    user_id: "user",
    institution_name: null,
    account_type: "bank",
    account_role: null,
    parent_account_id: null,
    include_in_cash_flow: true,
    include_in_net_worth: true,
    currency: "ZAR",
    is_active: true,
    created_at: "2026-05-26T00:00:00Z",
    ...input
  };
}
