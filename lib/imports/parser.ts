import ExcelJS from "exceljs";

export type ImportSourceFormat = "csv" | "xlsx";

export type ParsedImportRow = {
  rowNumber: number;
  rawRow: Record<string, string>;
  transactionDate: string | null;
  postedDate: string | null;
  descriptionRaw: string | null;
  descriptionClean: string | null;
  amount: number | null;
  currency: string | null;
  direction: "income" | "expense" | "transfer" | null;
  balance: number | null;
  duplicateKey: string | null;
  status: "approved" | "invalid" | "duplicate";
  errorCode: string | null;
  errorMessage: string | null;
};

export type ImportColumnMapping = {
  date?: string;
  postedDate?: string;
  description?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  balance?: string;
  currency?: string;
};

export type ParsedImport = {
  sourceFormat: ImportSourceFormat;
  mapping: ImportColumnMapping;
  rows: ParsedImportRow[];
};

type AiImportMappingSuggestion = {
  header_row_index: number;
  rows_to_ignore_before_index: number;
  date_column: string;
  amount_column: string;
  balance_column: string;
  description_column: string;
  confidence: number;
  reasoning_summary: string;
};

type ParseImportFileInput = {
  buffer: Buffer;
  fileName: string;
  accountId: string;
  defaultCurrency: string;
};

const dateHeaders = ["date", "transaction date", "trans date", "value date"];
const postedDateHeaders = ["posted date", "posting date", "settlement date"];
const descriptionHeaders = [
  "description",
  "details",
  "detail",
  "narrative",
  "merchant",
  "memo",
  "reference",
  "transaction description"
];
const amountHeaders = ["amount", "value", "transaction amount", "amt"];
const debitHeaders = ["debit", "withdrawal", "withdrawals", "paid out", "money out"];
const creditHeaders = ["credit", "deposit", "deposits", "paid in", "money in"];
const balanceHeaders = ["balance", "running balance", "available balance"];
const currencyHeaders = ["currency", "curr", "ccy"];

export async function parseImportFile(input: ParseImportFileInput): Promise<ParsedImport> {
  const sourceFormat = getSourceFormat(input.fileName);
  const table =
    sourceFormat === "csv"
      ? parseCsv(input.buffer.toString("utf8"))
      : await parseXlsx(input.buffer);
  const aiMapping = hasReliableTransactionHeader(table) ? null : await suggestMappingWithAi(table);

  return parseTable({
    table,
    accountId: input.accountId,
    defaultCurrency: input.defaultCurrency,
    sourceFormat,
    aiMapping
  });
}

export function parseCsvImport(input: {
  csv: string;
  accountId: string;
  defaultCurrency: string;
}): ParsedImport {
  return parseTable({
    table: parseCsv(input.csv),
    accountId: input.accountId,
    defaultCurrency: input.defaultCurrency,
    sourceFormat: "csv"
  });
}

export function normalizeDescription(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ");
}

export function buildDuplicateKey(input: {
  accountId: string;
  transactionDate: string;
  amount: number;
  descriptionClean: string;
}): string {
  return [
    input.accountId,
    input.transactionDate,
    input.amount.toFixed(2),
    normalizeDescription(input.descriptionClean)
  ].join("|");
}

function parseTable(input: {
  table: string[][];
  accountId: string;
  defaultCurrency: string;
  sourceFormat: ImportSourceFormat;
  aiMapping?: AiImportMappingSuggestion | null;
}): ParsedImport {
  const table = input.table.map((row) => trimTrailingEmptyCells(row));
  const header = resolveHeader(table, input.aiMapping);

  if (!header) {
    return {
      sourceFormat: input.sourceFormat,
      mapping: {},
      rows: []
    };
  }

  const headers = header.row.map((headerCell, index) => headerCell.trim() || `Column ${index + 1}`);
  const mapping = header.mapping ?? detectColumnMapping(headers);
  const seenDuplicateKeys = new Set<string>();
  const dataRows = table
    .slice(header.index + 1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => alignRowToHeaders(row, headers, mapping));

  const rows = dataRows.map((row, rowIndex) => {
    const rawRow = headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = row[index]?.trim() ?? "";
      return record;
    }, {});

    const transactionDate = parseDateValue(getMappedValue(rawRow, mapping.date));
    const postedDate = parseDateValue(getMappedValue(rawRow, mapping.postedDate));
    const descriptionRaw = cleanNullable(getMappedValue(rawRow, mapping.description));
    const descriptionClean = descriptionRaw ? normalizeDescription(descriptionRaw) : null;
    const currency = normalizeCurrency(getMappedValue(rawRow, mapping.currency), input.defaultCurrency);
    const amountResult = resolveAmount(rawRow, mapping);
    const duplicateKey =
      transactionDate && descriptionClean && amountResult.amount !== null
        ? buildDuplicateKey({
            accountId: input.accountId,
            transactionDate,
            amount: amountResult.amount,
            descriptionClean
          })
        : null;

    const errors = [
      transactionDate ? null : "Missing or invalid transaction date",
      descriptionRaw ? null : "Missing description",
      amountResult.amount !== null ? null : "Missing or invalid amount",
      amountResult.error
    ].filter((error): error is string => Boolean(error));

    let status: ParsedImportRow["status"] = errors.length > 0 ? "invalid" : "approved";
    let errorCode = errors.length > 0 ? "parse_error" : null;
    let errorMessage = errors.join("; ") || null;

    if (duplicateKey && seenDuplicateKeys.has(duplicateKey)) {
      status = "duplicate";
      errorCode = "duplicate_in_file";
      errorMessage = "Duplicate candidate within this file";
    }

    if (duplicateKey) {
      seenDuplicateKeys.add(duplicateKey);
    }

    return {
      rowNumber: rowIndex + 2,
      rawRow,
      transactionDate,
      postedDate,
      descriptionRaw,
      descriptionClean,
      amount: amountResult.amount,
      currency,
      direction: amountResult.direction,
      balance: parseNumberValue(getMappedValue(rawRow, mapping.balance)),
      duplicateKey,
      status,
      errorCode,
      errorMessage
    };
  });

  return {
    sourceFormat: input.sourceFormat,
    mapping,
    rows
  };
}

function detectColumnMapping(headers: string[]): ImportColumnMapping {
  const usedHeaders = new Set<string>();
  const takeHeader = (candidates: string[]) => {
    const header = findHeader(headers, candidates, usedHeaders);

    if (header) {
      usedHeaders.add(header);
    }

    return header;
  };

  return {
    date: takeHeader(dateHeaders),
    postedDate: takeHeader(postedDateHeaders),
    description: takeHeader(descriptionHeaders),
    amount: takeHeader(amountHeaders),
    debit: takeHeader(debitHeaders),
    credit: takeHeader(creditHeaders),
    balance: takeHeader(balanceHeaders),
    currency: takeHeader(currencyHeaders)
  };
}

function hasReliableTransactionHeader(rows: string[][]): boolean {
  return findReliableHeaderIndex(rows.map((row) => trimTrailingEmptyCells(row))) !== null;
}

function resolveHeader(
  rows: string[][],
  aiMapping?: AiImportMappingSuggestion | null
): {
  index: number;
  row: string[];
  mapping?: ImportColumnMapping;
} | null {
  const aiHeader = resolveAiHeader(rows, aiMapping);

  if (aiHeader) {
    return aiHeader;
  }

  const reliableHeaderIndex = findReliableHeaderIndex(rows);

  if (reliableHeaderIndex !== null) {
    return {
      index: reliableHeaderIndex,
      row: rows[reliableHeaderIndex]
    };
  }

  const firstMeaningfulIndex = rows.findIndex((row) =>
    row.some((cell) => cell.trim().length > 0)
  );

  if (firstMeaningfulIndex === -1) {
    return null;
  }

  return {
    index: firstMeaningfulIndex,
    row: rows[firstMeaningfulIndex]
  };
}

function findReliableHeaderIndex(rows: string[][]): number | null {
  const index = rows.findIndex((row) => isLikelyTransactionHeader(row));
  return index === -1 ? null : index;
}

function isLikelyTransactionHeader(row: string[]): boolean {
  const meaningfulCells = row.filter((cell) => cell.trim().length > 0);

  if (meaningfulCells.length < 3) {
    return false;
  }

  const mapping = detectColumnMapping(row);
  const hasDate = Boolean(mapping.date);
  const hasDescription = Boolean(mapping.description);
  const hasAmount = Boolean(mapping.amount || mapping.debit || mapping.credit);

  return hasDate && hasDescription && hasAmount;
}

function alignRowToHeaders(
  row: string[],
  headers: string[],
  mapping: ImportColumnMapping
): string[] {
  const trimmedRow = trimTrailingEmptyCells(row);

  if (trimmedRow.length <= headers.length) {
    return trimmedRow;
  }

  const descriptionIndex = mapping.description
    ? headers.findIndex((header) => header === mapping.description)
    : -1;

  if (descriptionIndex === -1) {
    return trimmedRow;
  }

  const aligned: string[] = [];
  let sourceIndex = 0;

  for (let targetIndex = 0; targetIndex < headers.length; targetIndex += 1) {
    if (targetIndex === descriptionIndex) {
      const fieldsAfterDescription = headers.length - descriptionIndex - 1;
      const descriptionEnd = Math.max(sourceIndex + 1, trimmedRow.length - fieldsAfterDescription);
      aligned[targetIndex] = trimmedRow.slice(sourceIndex, descriptionEnd).join(",").trim();
      sourceIndex = descriptionEnd;
      continue;
    }

    aligned[targetIndex] = trimmedRow[sourceIndex] ?? "";
    sourceIndex += 1;
  }

  return aligned;
}

function resolveAiHeader(
  rows: string[][],
  aiMapping?: AiImportMappingSuggestion | null
): {
  index: number;
  row: string[];
  mapping: ImportColumnMapping;
} | null {
  if (!aiMapping || aiMapping.confidence < 0.7) {
    return null;
  }

  const headerIndex = Number.isInteger(aiMapping.header_row_index)
    ? aiMapping.header_row_index
    : aiMapping.rows_to_ignore_before_index;

  if (headerIndex < 0 || headerIndex >= rows.length) {
    return null;
  }

  const headers = rows[headerIndex].map((header, index) => header.trim() || `Column ${index + 1}`);
  const mapping: ImportColumnMapping = {
    date: resolveSuggestedColumn(headers, aiMapping.date_column),
    amount: resolveSuggestedColumn(headers, aiMapping.amount_column),
    balance: resolveSuggestedColumn(headers, aiMapping.balance_column),
    description: resolveSuggestedColumn(headers, aiMapping.description_column)
  };

  if (!mapping.date || !mapping.amount || !mapping.description) {
    return null;
  }

  const mappedColumns = Object.values(mapping).filter(Boolean);

  if (new Set(mappedColumns).size !== mappedColumns.length) {
    return null;
  }

  return {
    index: headerIndex,
    row: headers,
    mapping
  };
}

function resolveSuggestedColumn(headers: string[], suggestion: string): string | undefined {
  const trimmed = suggestion.trim();
  const numericIndex = Number.parseInt(trimmed, 10);

  if (Number.isInteger(numericIndex)) {
    const zeroBased = numericIndex >= 1 ? numericIndex - 1 : numericIndex;

    if (headers[zeroBased]) {
      return headers[zeroBased];
    }
  }

  const normalizedSuggestion = normalizeHeader(trimmed);

  return headers.find((header) => normalizeHeader(header) === normalizedSuggestion);
}

async function suggestMappingWithAi(rows: string[][]): Promise<AiImportMappingSuggestion | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const sampleRows = rows.slice(0, 20).map((row, index) => ({
    index,
    columns: row.slice(0, 12).map((cell) => cell.slice(0, 200))
  }));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_CLASSIFICATION || "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Identify the transaction table header and column mapping for a bank export. Return only the requested JSON. Do not infer or create transactions."
          },
          {
            role: "user",
            content: JSON.stringify({
              task:
                "Find the transaction header row and map date, amount, balance, and description columns. Rows are zero-indexed.",
              sample_rows: sampleRows
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "import_mapping_suggestion",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "header_row_index",
                "rows_to_ignore_before_index",
                "date_column",
                "amount_column",
                "balance_column",
                "description_column",
                "confidence",
                "reasoning_summary"
              ],
              properties: {
                header_row_index: { type: "integer", minimum: 0 },
                rows_to_ignore_before_index: { type: "integer", minimum: 0 },
                date_column: { type: "string" },
                amount_column: { type: "string" },
                balance_column: { type: "string" },
                description_column: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reasoning_summary: { type: "string" }
              }
            }
          }
        }
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const outputText = extractResponseText(data);

    if (!outputText) {
      return null;
    }

    return validateAiMapping(JSON.parse(outputText));
  } catch {
    return null;
  }
}

function extractResponseText(data: Record<string, unknown>): string | null {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (!Array.isArray(data.output)) {
    return null;
  }

  for (const outputItem of data.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (typeof contentItem.text === "string") {
        return contentItem.text;
      }
    }
  }

  return null;
}

function validateAiMapping(value: unknown): AiImportMappingSuggestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const headerRowIndex = getFiniteNumber(value.header_row_index);
  const rowsToIgnoreBeforeIndex = getFiniteNumber(value.rows_to_ignore_before_index);
  const confidence = getFiniteNumber(value.confidence);
  const dateColumn = getString(value.date_column);
  const amountColumn = getString(value.amount_column);
  const balanceColumn = getString(value.balance_column);
  const descriptionColumn = getString(value.description_column);
  const reasoningSummary = getString(value.reasoning_summary);

  if (
    headerRowIndex === null ||
    rowsToIgnoreBeforeIndex === null ||
    confidence === null ||
    !dateColumn ||
    !amountColumn ||
    !descriptionColumn ||
    !reasoningSummary
  ) {
    return null;
  }

  return {
    header_row_index: Math.trunc(headerRowIndex),
    rows_to_ignore_before_index: Math.trunc(rowsToIgnoreBeforeIndex),
    date_column: dateColumn,
    amount_column: amountColumn,
    balance_column: balanceColumn ?? "",
    description_column: descriptionColumn,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasoning_summary: reasoningSummary
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function getFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function findHeader(
  headers: string[],
  candidates: string[],
  usedHeaders: Set<string>
): string | undefined {
  return headers.find((header) => {
    if (usedHeaders.has(header)) {
      return false;
    }

    const normalized = normalizeHeader(header);
    return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate));
  });
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function getMappedValue(rawRow: Record<string, string>, header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const value = rawRow[header]?.trim();
  return value ? value : null;
}

function resolveAmount(
  rawRow: Record<string, string>,
  mapping: ImportColumnMapping
): {
  amount: number | null;
  direction: ParsedImportRow["direction"];
  error: string | null;
} {
  const debit = parseNumberValue(getMappedValue(rawRow, mapping.debit));
  const credit = parseNumberValue(getMappedValue(rawRow, mapping.credit));

  if (debit !== null || credit !== null) {
    if (debit !== null && credit !== null && debit !== 0 && credit !== 0) {
      return {
        amount: null,
        direction: null,
        error: "Both debit and credit contain values"
      };
    }

    if (credit !== null && credit !== 0) {
      return {
        amount: roundMoney(Math.abs(credit)),
        direction: "income",
        error: null
      };
    }

    if (debit !== null && debit !== 0) {
      return {
        amount: roundMoney(-Math.abs(debit)),
        direction: "expense",
        error: null
      };
    }
  }

  const amount = parseNumberValue(getMappedValue(rawRow, mapping.amount));

  if (amount === null) {
    return {
      amount: null,
      direction: null,
      error: null
    };
  }

  return {
    amount: roundMoney(amount),
    direction: amount < 0 ? "expense" : "income",
    error: null
  };
}

function parseNumberValue(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const negative = /^\(.*\)$/.test(value) || value.trim().startsWith("-");
  const normalized = value.replace(/[(),\sA-Z$£€R]/gi, "").replace(/^\+/, "");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return negative ? -Math.abs(parsed) : parsed;
}

function parseDateValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const yearFirstSlashMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
  if (yearFirstSlashMatch) {
    return formatDateParts(
      Number(yearFirstSlashMatch[1]),
      Number(yearFirstSlashMatch[2]),
      Number(yearFirstSlashMatch[3])
    );
  }

  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = normalizeYear(Number(slashMatch[3]));
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

function normalizeYear(year: number): number {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  return year;
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

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

function normalizeCurrency(value: string | null, fallback: string): string {
  const currency = value?.trim().toUpperCase() || fallback.toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback.toUpperCase();
}

function cleanNullable(value: string | null): string | null {
  return value?.trim() || null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSourceFormat(fileName: string): ImportSourceFormat {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv")) {
    return "csv";
  }

  if (lower.endsWith(".xlsx")) {
    return "xlsx";
  }

  throw new Error("Unsupported file type. Upload a CSV or XLSX file.");
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return [];
  }

  const rows: string[][] = [];

  worksheet.eachRow({ includeEmpty: false }, (worksheetRow) => {
    const values = Array.isArray(worksheetRow.values) ? worksheetRow.values.slice(1) : [];
    rows.push(trimTrailingEmptyCells(values.map((value) => formatXlsxCell(value))));
  });

  if (isSingleColumnCsvLikeTable(rows)) {
    return parseCsv(rows.map((row) => row[0] ?? "").join("\n"));
  }

  return rows;
}

function isSingleColumnCsvLikeTable(rows: string[][]): boolean {
  const meaningfulRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));

  if (meaningfulRows.length < 2) {
    return false;
  }

  if (meaningfulRows.some((row) => row.filter((cell) => cell.trim().length > 0).length > 1)) {
    return false;
  }

  const csvLikeRows = meaningfulRows.filter((row) => (row[0] ?? "").includes(","));
  return csvLikeRows.length >= 2;
}

function trimTrailingEmptyCells(values: string[]): string[] {
  const trimmed = [...values];

  while (trimmed.length > 0 && !trimmed[trimmed.length - 1].trim()) {
    trimmed.pop();
  }

  return trimmed;
}

function formatXlsxCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }

  if (typeof value === "object" && "result" in value) {
    return formatXlsxCell(value.result);
  }

  return String(value);
}
