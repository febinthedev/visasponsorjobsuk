// Trim and collapse whitespace; empty → null.
export function cleanText(value: string): string | null {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned === "" ? null : cleaned;
}

// Trailing legal-form words that don't distinguish one company from another.
const LEGAL_SUFFIXES = new Set(["ltd", "limited", "plc", "llp", "lp", "inc", "incorporated", "cic"]);

// Name used to match the same employer across spellings ("ACME LTD" = "Acme Limited").
// Deliberately conservative: only case, "&", punctuation and a trailing legal suffix are ignored.
export function normaliseName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "") // O'Brien → obrien, C.I.C. → cic
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  // A name with no Latin letters or digits: fall back to the cleaned original, lowercased.
  return words.length > 0 ? words.join(" ") : (cleanText(name) ?? "").toLowerCase();
}
