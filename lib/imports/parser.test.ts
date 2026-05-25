import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildDuplicateKey, parseCsvImport, parseImportFile } from "@/lib/imports/parser";

describe("parseCsvImport", () => {
  it("maps signed amount CSV rows into approved staged rows", () => {
    const result = parseCsvImport({
      accountId: "account-1",
      defaultCurrency: "ZAR",
      csv: [
        "Date,Description,Amount,Balance",
        "2026-05-01,Salary,1000.00,1000.00",
        "2026-05-02,Groceries,-125.50,874.50"
      ].join("\n")
    });

    expect(result.sourceFormat).toBe("csv");
    expect(result.mapping).toMatchObject({
      date: "Date",
      description: "Description",
      amount: "Amount"
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      amount: 1000,
      direction: "income",
      status: "approved"
    });
    expect(result.rows[1]).toMatchObject({
      amount: -125.5,
      direction: "expense",
      status: "approved"
    });
  });

  it("normalizes debit and credit columns into signed amounts", () => {
    const result = parseCsvImport({
      accountId: "account-1",
      defaultCurrency: "ZAR",
      csv: [
        "Transaction Date,Details,Debit,Credit",
        "01/05/2026,Card purchase,45.20,",
        "02/05/2026,Refund,,12.30"
      ].join("\n")
    });

    expect(result.rows[0]).toMatchObject({
      transactionDate: "2026-05-01",
      amount: -45.2,
      direction: "expense"
    });
    expect(result.rows[1]).toMatchObject({
      transactionDate: "2026-05-02",
      amount: 12.3,
      direction: "income"
    });
  });

  it("marks missing required values as invalid", () => {
    const result = parseCsvImport({
      accountId: "account-1",
      defaultCurrency: "ZAR",
      csv: ["Date,Description,Amount", "2026-05-01,,25.00"].join("\n")
    });

    expect(result.rows[0]).toMatchObject({
      status: "invalid",
      errorCode: "parse_error"
    });
    expect(result.rows[0].errorMessage).toContain("Missing description");
  });

  it("marks duplicate rows within the same file", () => {
    const duplicateKey = buildDuplicateKey({
      accountId: "account-1",
      transactionDate: "2026-05-01",
      amount: -10,
      descriptionClean: "Coffee"
    });

    const result = parseCsvImport({
      accountId: "account-1",
      defaultCurrency: "ZAR",
      csv: [
        "Date,Description,Amount",
        "2026-05-01,Coffee,-10.00",
        "2026-05-01, coffee ,-10.00"
      ].join("\n")
    });

    expect(result.rows[0].duplicateKey).toBe(duplicateKey);
    expect(result.rows[0].status).toBe("approved");
    expect(result.rows[1].status).toBe("duplicate");
  });

  it("ignores FNB-style preamble rows and preserves comma descriptions", () => {
    const result = parseCsvImport({
      accountId: "account-1",
      defaultCurrency: "ZAR",
      csv: [
        "ACCOUNT TRANSACTION HISTORY",
        "",
        "Name:, Test, User",
        "Account:, 123456789, [Easy Account]",
        "Balance:, 707.45, 20861.77",
        "",
        "Date, Amount, Balance, Description",
        "2026/05/25, -1222.00, 0.00, FNBCC DCRE1925255 260525",
        "2026/05/25, 22142.60, 0.00, FNB OB PMT Y",
        "2026/05/23, -23.15, 707.45, BYC DEBIT 62845480657",
        "2026/05/22, -110.00, 730.60, PURCH CANVA 400738******4647",
        "2026/05/22, -39.94, 840.60, PURCH DL UBER 400738******4647",
        "2026/05/23, 300.00, 880.54, FNB APP TRANSFER FROM FUEL",
        "2026/05/24, -10.00, 870.54, CR.INT.RATE   4,39000"
      ].join("\n")
    });

    expect(result.mapping).toMatchObject({
      date: "Date",
      amount: "Amount",
      balance: "Balance",
      description: "Description"
    });
    expect(result.rows).toHaveLength(7);
    expect(result.rows.every((row) => row.status === "approved")).toBe(true);
    expect(result.rows.every((row) => row.errorCode === null)).toBe(true);
    expect(result.rows[0]).toMatchObject({
      transactionDate: "2026-05-25",
      descriptionRaw: "FNBCC DCRE1925255 260525",
      amount: -1222,
      balance: 0,
      direction: "expense"
    });
    expect(result.rows[1]).toMatchObject({
      amount: 22142.6,
      direction: "income"
    });
    expect(result.rows[6]).toMatchObject({
      transactionDate: "2026-05-24",
      descriptionRaw: "CR.INT.RATE   4,39000",
      amount: -10,
      balance: 870.54,
      direction: "expense"
    });
  });

  it("parses single-column XLSX rows that contain CSV text", async () => {
    const buffer = await buildSingleColumnCsvXlsx([
      "Date,Description,Amount,Balance",
      "2026-05-01,Salary,1000.00,1000.00",
      "2026-05-02,Groceries,-125.50,874.50",
      "2026-05-03,Netflix,-199.00,675.50",
      "2026-05-03,Netflix,-199.00,675.50"
    ]);

    const result = await parseImportFile({
      accountId: "account-1",
      buffer,
      defaultCurrency: "ZAR",
      fileName: "smoke-test.xlsx"
    });

    expect(result.sourceFormat).toBe("xlsx");
    expect(result.mapping).toMatchObject({
      date: "Date",
      description: "Description",
      amount: "Amount",
      balance: "Balance"
    });
    const mappedColumns = Object.values(result.mapping).filter(Boolean);
    expect(new Set(mappedColumns).size).toBe(mappedColumns.length);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({
      transactionDate: "2026-05-01",
      descriptionRaw: "Salary",
      amount: 1000,
      balance: 1000,
      direction: "income",
      status: "approved"
    });
    expect(result.rows[1]).toMatchObject({
      transactionDate: "2026-05-02",
      descriptionRaw: "Groceries",
      amount: -125.5,
      balance: 874.5,
      direction: "expense",
      status: "approved"
    });
    expect(result.rows[2]).toMatchObject({
      transactionDate: "2026-05-03",
      descriptionRaw: "Netflix",
      amount: -199,
      direction: "expense",
      status: "approved"
    });
    expect(result.rows[3]).toMatchObject({
      transactionDate: "2026-05-03",
      descriptionRaw: "Netflix",
      amount: -199,
      direction: "expense",
      status: "duplicate",
      errorCode: "duplicate_in_file"
    });
  });
});

async function buildSingleColumnCsvXlsx(lines: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Export");

  lines.forEach((line) => {
    worksheet.addRow([line]);
  });

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
