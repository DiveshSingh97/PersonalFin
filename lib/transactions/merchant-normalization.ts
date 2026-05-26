export type NormalizedMerchant = {
  originalDescription: string;
  cleanedDescription: string;
  displayName: string;
  normalizedKey: string;
};

const knownMerchantRules: Array<{ pattern: RegExp; displayName: string }> = [
  { pattern: /\bUBER\s*EATS\b|\bNEW\s+UBER\s+EATS\b/i, displayName: "Uber Eats" },
  { pattern: /\bUBER\b/i, displayName: "Uber" },
  { pattern: /\bWOOLWORTHS\b|\bWOOLIES\b/i, displayName: "Woolworths" },
  { pattern: /\bOPENAI\b|CHATGPT/i, displayName: "OpenAI / ChatGPT" },
  { pattern: /#\s*MONTHLY\s+ACCOUNT\s+FEE/i, displayName: "FNB Monthly Account Fee" },
  { pattern: /#\s*SERVICE\s+FEES?/i, displayName: "Bank Service Fees" },
  { pattern: /\bYOUTUBE\s*PREMI\b|\bYOUTUBEPREMI\b|\bGOOGLE\s+YOUTUBE/i, displayName: "YouTube Premium" },
  { pattern: /\bSPOTIFY\s*ZA\b|\bSPOTIFY\b/i, displayName: "Spotify" },
  { pattern: /\bLUNO\b/i, displayName: "Luno" }
];

const exportPrefixes = [
  /^PURCH\s+/i,
  /^POS\s+/i,
  /^CARD\s+PURCHASE\s+/i,
  /^DEBIT\s+CARD\s+/i,
  /^DL\s+/i,
  /^NEW\s+/i
];

export function normalizeMerchantDescription(description: string | null | undefined): NormalizedMerchant {
  const originalDescription = description?.trim() ?? "";
  const cleanedDescription = cleanMerchantDescription(originalDescription);
  const knownMerchant = knownMerchantRules.find((rule) => rule.pattern.test(originalDescription));
  const displayName = knownMerchant?.displayName ?? toTitleCase(cleanedDescription || originalDescription);
  const normalizedKey = buildMerchantKey(displayName || cleanedDescription || originalDescription);

  return {
    originalDescription,
    cleanedDescription,
    displayName: displayName || "Unknown Merchant",
    normalizedKey: normalizedKey || "unknown-merchant"
  };
}

export function cleanMerchantDescription(description: string): string {
  let cleaned = description.trim();

  cleaned = cleaned.replace(/\b\d{4,6}\*{2,}\d{2,6}\b/g, " ");
  cleaned = cleaned.replace(/\bX{2,}\d{2,6}\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:CARD|ACC(?:OUNT)?|A\/C)\s*\d{4,}\b/gi, " ");
  cleaned = cleaned.replace(/\b\d{10,}\b/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of exportPrefixes) {
      const next = cleaned.replace(prefix, "").trim();
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
  }

  cleaned = cleaned.replace(/\s+\*+\s*/g, " ").replace(/\s+/g, " ").trim();
  return cleaned;
}

export function buildMerchantKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && /^[a-z]+$/.test(word)) {
        return word.toUpperCase();
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}
