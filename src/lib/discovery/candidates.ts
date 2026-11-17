// Likely board names for an employer, built from its normalised register name.
// Kept to 2–3 guesses per employer: with ~127k employers and 5 hiring systems, every extra guess
// costs hundreds of thousands of requests on the first pass.

// Words often added after the brand in legal names ("Monzo Bank", "Palantir Technologies UK").
const GENERIC_TAIL = new Set([
  "uk", "gb", "group", "holdings", "international", "services", "solutions", "systems",
  "technologies", "technology", "bank", "company", "europe", "enterprises",
]);

const VALID = /^[a-z0-9][a-z0-9-]{2,}$/; // board names: lowercase letters, digits, hyphens; 3+ chars

export function candidateKeys(nameNormalised: string): string[] {
  const words = nameNormalised.split(" ").filter(Boolean);
  const core = [...words];
  while (core.length > 1 && GENERIC_TAIL.has(core[core.length - 1])) core.pop();

  const keys = [words.join(""), words.join("-")];
  const coreIsJustGeneric = core.length === 1 && GENERIC_TAIL.has(core[0]);
  if (core.length < words.length && !coreIsJustGeneric) keys.push(core.join(""), core.join("-"));

  return [...new Set(keys)].filter((k) => VALID.test(k));
}
