// Words that put a location outside the UK. Compared as whole location parts (after normPlace),
// e.g. "Birmingham, Alabama" → "alabama" is foreign, so the job isn't treated as UK.

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska",
  "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas",
  "utah", "vermont", "virginia", "washington dc", "district of columbia", "west virginia", "wisconsin", "wyoming",
  "new england", "bay area", "silicon valley", "north america",
];
const CANADA = [
  "ontario", "quebec", "british columbia", "alberta", "manitoba", "saskatchewan", "nova scotia", "new brunswick",
  "newfoundland", "prince edward island",
];
const AUSTRALIA = ["new south wales", "queensland", "western australia", "south australia", "tasmania", "australian capital territory"];
const COUNTRIES = [
  "united states", "united states of america", "usa", "us", "america", "canada", "mexico", "brazil", "argentina",
  "chile", "colombia", "peru", "ireland", "republic of ireland", "france", "germany", "spain", "portugal",
  "italy", "netherlands", "the netherlands", "belgium", "luxembourg", "switzerland", "austria", "denmark",
  "sweden", "norway", "finland", "iceland", "poland", "czech republic", "czechia", "slovakia", "hungary",
  "romania", "bulgaria", "greece", "cyprus", "malta", "croatia", "serbia", "slovenia", "estonia", "latvia",
  "lithuania", "ukraine", "turkey", "turkiye", "israel", "united arab emirates", "uae", "saudi arabia", "qatar",
  "bahrain", "kuwait", "oman", "egypt", "morocco", "south africa", "nigeria", "kenya", "ghana", "india",
  "pakistan", "bangladesh", "sri lanka", "china", "hong kong", "taiwan", "japan", "south korea", "korea",
  "singapore", "malaysia", "indonesia", "philippines", "thailand", "vietnam", "australia", "new zealand",
];

export const FOREIGN_NAMES = new Set([...US_STATES, ...CANADA, ...AUSTRALIA, ...COUNTRIES]);

// Region/state codes, matched only when written in capitals as their own part ("Memphis, TN").
export const FOREIGN_CODES = new Set([
  // US
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "USA",
  // Canada
  "ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE",
  // Australia
  "NSW", "VIC", "QLD", "TAS", "ACT",
]);
