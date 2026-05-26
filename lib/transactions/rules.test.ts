import { describe, expect, it } from "vitest";
import { doesRuleMatchTransaction, findMatchingRule, type TransactionRule } from "@/lib/transactions/rules";

const baseRule: TransactionRule = {
  match_type: "contains",
  pattern: "Uber",
  category_id: "transport",
  direction: null,
  is_subscription: null,
  is_transfer: null,
  priority: 100,
  is_active: true
};

describe("doesRuleMatchTransaction", () => {
  it("matches against normalized merchant text", () => {
    expect(
      doesRuleMatchTransaction(baseRule, {
        description_raw: "PURCH DL UBER 400738******4647",
        description_clean: null,
        direction: "expense"
      })
    ).toBe(true);
  });

  it("matches Woolworths against cleaned parser descriptions", () => {
    expect(
      doesRuleMatchTransaction(
        { ...baseRule, pattern: "Woolworths", category_id: "groceries" },
        {
          description_raw: "PURCH WOOLWORTHS 400738******4647",
          description_clean: "purch woolworths 400738 4647",
          direction: "expense"
        }
      )
    ).toBe(true);
  });

  it("respects direction constraints", () => {
    expect(
      doesRuleMatchTransaction(
        { ...baseRule, direction: "income" },
        {
          description_raw: "PURCH DL UBER 400738******4647",
          description_clean: null,
          direction: "expense"
        }
      )
    ).toBe(false);
  });

  it("ignores inactive rules", () => {
    expect(
      doesRuleMatchTransaction(
        { ...baseRule, is_active: false },
        {
          description_raw: "PURCH DL UBER 400738******4647",
          description_clean: null,
          direction: "expense"
        }
      )
    ).toBe(false);
  });
});

describe("findMatchingRule", () => {
  it("uses the lowest priority matching rule first", () => {
    const match = findMatchingRule(
      {
        description_raw: "PURCH WOOLWORTHS 400738******4647",
        description_clean: null,
        direction: "expense"
      },
      [
        { ...baseRule, pattern: "Woolworths", category_id: "general", priority: 100 },
        { ...baseRule, pattern: "Woolworths", category_id: "groceries", priority: 10 }
      ]
    );

    expect(match?.category_id).toBe("groceries");
  });
});
