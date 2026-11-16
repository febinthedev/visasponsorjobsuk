import type { RATINGS } from "@/db/schema";

export type Rating = (typeof RATINGS)[number];
export type Licence = "worker" | "temporary";

// Reads the register's "Type & Rating" column, e.g. "Worker (A rating)", "Temporary Worker (B rating)",
// "Worker (A (Premium))", "Worker (UK Expansion Worker: Provisional )".
// Premium and SME+ are paid Home Office services on top of an A rating, so they count as "a".
// Wording we don't recognise gives rating null, which never counts as A-rated.
export function parseTypeRating(value: string): { licence: Licence | null; rating: Rating | null } {
  const match = value.trim().match(/^(Temporary Worker|Worker)\s*\((.*)\)$/i);
  if (!match) return { licence: null, rating: null };

  const licence: Licence = match[1].toLowerCase() === "worker" ? "worker" : "temporary";
  const detail = match[2].trim().toLowerCase();
  let rating: Rating | null = null;
  if (detail === "a rating" || /^a \((premium|sme\+)\)$/.test(detail)) rating = "a";
  else if (detail === "b rating") rating = "b";
  else if (/provisional/.test(detail)) rating = "provisional";
  return { licence, rating };
}

// If an employer's rows disagree, keep the most cautious rating: unrecognised (null) < b < provisional < a.
const ORDER: (Rating | null)[] = [null, "b", "provisional", "a"];
export function worstRating(current: Rating | null | undefined, next: Rating | null): Rating | null {
  if (current === undefined) return next;
  return ORDER.indexOf(current) <= ORDER.indexOf(next) ? current : next;
}
