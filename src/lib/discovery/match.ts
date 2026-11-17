// Decides whether a job board belongs to a register employer (founder-approved rule, 2026-11-16):
// the board's name, normalised like register names, must fit exactly one live employer, where
// "fit" means the employer's name is that name or starts with it in whole words ("Monzo" →
// "monzo bank"). More than one fit → ambiguous, never a guess. UK jobs are checked separately.
import { normaliseName } from "@/lib/register/normalise";

type IndexedSponsor = { id: number; name: string };
export type SponsorIndex = Map<string, IndexedSponsor[]>; // first word → employers

export type MatchResult =
  | { result: "matched"; sponsorId: number }
  | { result: "ambiguous" | "no_match" | "no_name" };

// Live, non-agency employers only (the caller filters).
export function buildSponsorIndex(sponsors: { id: number; name_normalised: string }[]): SponsorIndex {
  const index: SponsorIndex = new Map();
  for (const s of sponsors) {
    const first = s.name_normalised.split(" ")[0];
    const list = index.get(first) ?? [];
    list.push({ id: s.id, name: s.name_normalised });
    index.set(first, list);
  }
  return index;
}

// Words boards add to their name that aren't part of the company's name.
const BOARD_SUFFIX = /\s+(careers|jobs|job board|hiring)$/;

export function matchBoard(boardName: string | null, index: SponsorIndex): MatchResult {
  const name = boardName ? normaliseName(boardName).replace(BOARD_SUFFIX, "") : "";
  if (!name.trim()) return { result: "no_name" };

  // Exact names and longer names count together: an exact name doesn't win, because e.g. the
  // register's "WISE" is a different organisation from "Wise Payments".
  const candidates = index.get(name.split(" ")[0]) ?? [];
  const fits = candidates.filter((s) => s.name === name || s.name.startsWith(`${name} `));

  if (fits.length === 1) return { result: "matched", sponsorId: fits[0].id };
  return { result: fits.length > 1 ? "ambiguous" : "no_match" };
}
