// Builds src/lib/uk/data/gb-places.json from the ONS Index of Place Names in Great Britain.
//
//   1. Download the CSV collection (e.g. July 2024, item 208d9884575647c29f0dd5a1184e711a) from
//      https://geoportal.statistics.gov.uk and unzip it.
//   2. npx tsx scripts/build-uk-places.ts path/to/IPN_GB_2024.csv
//
// Only towns and cities (built-up areas), councils, counties and regions are kept. The finer
// "locality" entries are left out on purpose: they include hamlets called Paris, Dublin, New York,
// Lisbon, Sydney, Toronto and Melbourne, which would make foreign jobs look like UK ones.
import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../src/lib/register/csv";
import { normPlace } from "../src/lib/uk/normalise";

const KEEP_TYPES = new Set(["BUA", "UA", "NMD", "MD", "LONB", "CA", "CTYLT", "RGN"]);
const AREA_COLUMNS = ["cty23nm", "ctyhistnm", "ctyltnm", "lad23nm", "rgn23nm", "ctry23nm"];

const path = process.argv[2];
if (!path) throw new Error("Usage: npx tsx scripts/build-uk-places.ts path/to/IPN_GB_<year>.csv");

const [header, ...rows] = parseCsv(readFileSync(path, "latin1"));
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column ${name} not found`);
  return i;
};
const [placeName, placeType] = [col("place23nm"), col("descnm")];
const areaCols = AREA_COLUMNS.map(col);

const names = new Set<string>();
for (const row of rows) {
  if (KEEP_TYPES.has(row[placeType])) names.add(normPlace(row[placeName]));
  for (const i of areaCols) if (row[i]) names.add(normPlace(row[i]));
}
names.delete("");

const out = {
  source: "ONS Index of Place Names in Great Britain (July 2024)",
  licence:
    "Source: Office for National Statistics licensed under the Open Government Licence v.3.0. Contains OS data © Crown copyright and database right 2024.",
  types: [...KEEP_TYPES],
  names: [...names].sort(),
};
writeFileSync("src/lib/uk/data/gb-places.json", JSON.stringify(out, null, 0) + "\n");
console.log(`Wrote ${out.names.length} place names.`);
