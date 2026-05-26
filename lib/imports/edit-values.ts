export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  const trimmed = value.trim();
  const yearFirstDate = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(trimmed);

  if (yearFirstDate) {
    return formatDateParts(
      Number(yearFirstDate[1]),
      Number(yearFirstDate[2]),
      Number(yearFirstDate[3])
    );
  }

  return "";
}

export function toNumberInputValue(value: number | string | null | undefined): string {
  const parsed = parseEditableNumber(value);
  return parsed === null ? "" : parsed.toFixed(2);
}

export function parseEditableNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (!value) {
    return null;
  }

  const compact = value.trim().replace(/\s/g, "");

  if (!compact) {
    return null;
  }

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimalSeparator =
    lastComma > -1 && lastDot > -1 ? (lastComma > lastDot ? "," : ".") : lastComma > -1 ? "," : ".";
  const normalized =
    decimalSeparator === ","
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}
