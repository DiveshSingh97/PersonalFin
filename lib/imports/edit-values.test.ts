import { describe, expect, it } from "vitest";
import {
  parseEditableNumber,
  toDateInputValue,
  toNumberInputValue
} from "@/lib/imports/edit-values";

describe("import edit input value helpers", () => {
  it("normalizes year-first slash dates for native date inputs", () => {
    expect(toDateInputValue("2026/05/25")).toBe("2026-05-25");
    expect(toDateInputValue("2026/4/5")).toBe("2026-04-05");
    expect(toDateInputValue("2026-05-25")).toBe("2026-05-25");
  });

  it("returns an empty date input value for unsupported date strings", () => {
    expect(toDateInputValue("25/05/2026")).toBe("");
    expect(toDateInputValue("not a date")).toBe("");
  });

  it("normalizes comma decimal amounts for native number inputs", () => {
    expect(toNumberInputValue("-1222,00")).toBe("-1222.00");
    expect(toNumberInputValue("22142,60")).toBe("22142.60");
    expect(toNumberInputValue("-27,5")).toBe("-27.50");
  });

  it("keeps dot-decimal amount input values machine safe", () => {
    expect(toNumberInputValue("-1222.00")).toBe("-1222.00");
    expect(toNumberInputValue(22142.6)).toBe("22142.60");
    expect(parseEditableNumber("1,222.60")).toBe(1222.6);
    expect(parseEditableNumber("1.222,60")).toBe(1222.6);
  });
});
