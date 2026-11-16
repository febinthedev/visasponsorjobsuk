import { agencyReason } from "./agency";
import { cleanText, normaliseName } from "./normalise";
import { parseTypeRating, worstRating, type Rating } from "./rating";

export const REGISTER_COLUMNS = ["Organisation Name", "Town/City", "County", "Type & Rating", "Route"];

export type RegisterSponsor = {
  name: string;
  name_normalised: string;
  town: string | null;
  county: string | null;
  routes: string[];
  rating: Rating | null; // Worker licence rating; null if Temporary-only or unrecognised
  is_agency: boolean;
  agency_reason: string | null;
};

// Identity of an employer: normalised name + town (town compared case-insensitively).
export function sponsorKey(nameNormalised: string, town: string | null): string {
  return `${nameNormalised}\u0000${(town ?? "").toLowerCase()}`;
}

// Turns the register's rows (one per employer per visa route, header first) into one entry per
// employer with all its routes. The first spelling seen is kept for name, town and county.
export function groupRegister(rows: string[][]): RegisterSponsor[] {
  const [header, ...data] = rows;
  if (!header || REGISTER_COLUMNS.some((col, i) => header[i]?.trim() !== col)) {
    throw new Error(`Register has unexpected columns: ${JSON.stringify(header)}`);
  }

  type Building = RegisterSponsor & { routeSet: Set<string>; workerRating: Rating | null | undefined };
  const byKey = new Map<string, Building>();
  for (const [rawName = "", rawTown = "", rawCounty = "", rawTypeRating = "", rawRoute = ""] of data) {
    const name = cleanText(rawName);
    if (!name) continue;
    const town = cleanText(rawTown);
    const name_normalised = normaliseName(name);
    const key = sponsorKey(name_normalised, town);

    let sponsor = byKey.get(key);
    if (!sponsor) {
      const reason = agencyReason(name);
      sponsor = {
        name,
        name_normalised,
        town,
        county: null,
        routes: [],
        rating: null,
        is_agency: reason !== null,
        agency_reason: reason,
        routeSet: new Set(),
        workerRating: undefined,
      };
      byKey.set(key, sponsor);
    }
    sponsor.county ??= cleanText(rawCounty);
    const route = cleanText(rawRoute);
    if (route) sponsor.routeSet.add(route);

    // Only the Worker licence covers Skilled Worker. Unrecognised wording is treated as a Worker
    // row with no rating, so it can only ever make the employer's rating more cautious.
    const { licence, rating } = parseTypeRating(rawTypeRating);
    if (licence !== "temporary") sponsor.workerRating = worstRating(sponsor.workerRating, rating);
  }

  return [...byKey.values()].map(({ routeSet, workerRating, ...s }) => ({
    ...s,
    routes: [...routeSet].sort(),
    rating: workerRating ?? null,
  }));
}
