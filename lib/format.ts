export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Missing";
  }

  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    currency,
    style: "currency"
  }).format(amount);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("en").format(value);
}
