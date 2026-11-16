// Decides whether a job is in the UK, and which of its places to show.
//
// 1. If the hiring system gives a country, trust it (UK if any country is the UK).
// 2. Otherwise read the place text. Each place is split into parts ("Memphis, TN" → "Memphis", "TN"):
//    - a foreign part (country, US state, "TN", "ON" …) makes the place abroad;
//    - a UK marker ("United Kingdom", "UK", "England" …) or a UK place name makes it UK;
//    - a lookalike name (Perth, Boston, Washington …) only counts with another UK part
//      ("Perth, Scotland" yes, "Perth" alone no);
//    - anything else, including a bare "Remote", is unclear, and unclear never counts as UK.
// A job listed in several places is UK if any place is; only those places are shown.
import gbPlaces from "./data/gb-places.json";
import { FOREIGN_CODES, FOREIGN_NAMES } from "./foreign";
import { normPlace } from "./normalise";

const NORTHERN_IRELAND = [
  "northern ireland", "ni", "belfast", "derry", "londonderry", "lisburn", "newry", "armagh", "craigavon",
  "portadown", "lurgan", "ballymena", "newtownabbey", "coleraine", "omagh", "enniskillen", "larne", "antrim",
  "banbridge", "dungannon", "carrickfergus", "holywood", "newtownards", "downpatrick", "strabane", "limavady",
  "magherafelt", "cookstown", "ballymoney", "county antrim", "county armagh", "county down", "county fermanagh",
  "county londonderry", "county tyrone", "co antrim", "co armagh", "co down", "co fermanagh", "co londonderry",
  "co tyrone",
];
// Common short forms and London districts that job ads use but the ONS list names differently.
const EXTRA_UK = [
  "newcastle", "hull", "stoke", "canary wharf", "city of london", "the city", "shoreditch", "soho", "mayfair",
  "kings cross", "holborn", "farringdon", "clerkenwell", "westminster", "greater london", "greater manchester",
];
const UK_PLACES = new Set([...gbPlaces.names, ...NORTHERN_IRELAND, ...EXTRA_UK]);

// UK place names that are better known as foreign cities.
const LOOKALIKES = new Set(["perth", "boston", "washington", "halifax", "hamilton", "victoria", "denver", "richmond"]);

const UK_MARKER = /\b(united kingdom|uk|great britain|england|scotland|wales|northern ireland)\b/;
const UK_COUNTRIES = new Set(["gb", "gbr", "uk", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland"]);

type Verdict = "uk" | "abroad" | "unclear";

function placeVerdict(place: string): Verdict {
  const parts = place.split(/,|\(|\)|\||\s[-–—]\s/).map((p) => p.trim()).filter(Boolean);
  let ukSignal = false;
  for (const raw of parts) {
    const p = normPlace(raw);
    const code = raw.replace(/\s+\d{5}(-\d{4})?$/, ""); // "CO 80020" (state + US ZIP code) → "CO"
    if (FOREIGN_CODES.has(code) || FOREIGN_NAMES.has(p)) return "abroad";
    // A lookalike on its own is no UK signal; it counts only if another part is ("Perth, Scotland").
    if (UK_MARKER.test(p) || (UK_PLACES.has(p) && !LOOKALIKES.has(p))) ukSignal = true;
  }
  return ukSignal ? "uk" : "unclear";
}

// "Cardiff, London or Remote (UK)" → ["Cardiff, London", "Remote (UK)"]. Lowercase "or" only, so
// the US state code in "Portland, OR" isn't split off.
const splitPlaces = (location: string) =>
  location.split(/;|\s+or\s+|\s+\/\s+/).map((p) => p.trim()).filter(Boolean);

export type UkCheck = { uk: boolean; ukLocations: string[]; reason: "country field" | "place name" | "abroad" | "unclear location" };

export function ukCheck(job: { locations: string[]; countries: string[] }): UkCheck {
  const places = job.locations.flatMap(splitPlaces);
  const verdicts = places.map((p) => ({ place: p, verdict: placeVerdict(p) }));

  if (job.countries.length > 0) {
    const uk = job.countries.some((c) => UK_COUNTRIES.has(normPlace(c)));
    if (!uk) return { uk: false, ukLocations: [], reason: "abroad" };
    // The country says UK; show every place except ones the text clearly puts abroad.
    return { uk: true, ukLocations: verdicts.filter((v) => v.verdict !== "abroad").map((v) => v.place), reason: "country field" };
  }

  const ukLocations = verdicts.filter((v) => v.verdict === "uk").map((v) => v.place);
  if (ukLocations.length > 0) return { uk: true, ukLocations, reason: "place name" };
  const abroad = verdicts.length > 0 && verdicts.every((v) => v.verdict === "abroad");
  return { uk: false, ukLocations: [], reason: abroad ? "abroad" : "unclear location" };
}
