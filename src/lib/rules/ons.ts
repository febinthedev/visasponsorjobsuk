// Reads the ONS SOC 2020 coding index (job title → occupation code) and the list of occupation
// codes (unit groups). Open Government Licence v3.0.
//
// The index's qualifiers (e.g. "Accountant" + "qualified" → 2421, plain "Accountant" → 4122) aren't
// kept: a title that maps to several codes is simply stored with each, so the labeller can see it
// isn't a confident match (blueprint: no confident match → can't be Likely eligible).

// The one way titles are cleaned, for both the index and job ads.
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type TitleCode = { title_normalised: string; soc_code: string };

export function parseCodingIndex(rows: string[][]): { titles: TitleCode[]; skipped: number } {
  const [head, ...body] = rows;
  const soc = head.indexOf("SOC_2020");
  const title = head.indexOf("INDEXOCC_-_natural_word_order");
  if (soc < 0 || title < 0) throw new Error(`Coding index columns SOC_2020 / INDEXOCC_-_natural_word_order not found: ${head.join(" | ")}`);

  const seen = new Set<string>();
  const titles: TitleCode[] = [];
  let skipped = 0;
  for (const r of body) {
    const soc_code = r[soc]?.trim() ?? "";
    const title_normalised = normTitle(r[title] ?? "");
    if (!/^\d{4}$/.test(soc_code) || !title_normalised) {
      skipped++;
      continue;
    }
    const key = `${title_normalised}|${soc_code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push({ title_normalised, soc_code });
  }
  return { titles, skipped };
}

// "SOC2020 framework" sheet: rows with a 4-digit unit group are the occupation codes.
export function parseFramework(rows: string[][]): { soc_code: string; title: string }[] {
  const [head, ...body] = rows;
  const unit = head.indexOf("SOC2020 Unit Group");
  const title = head.indexOf("SOC2020 Group Title");
  if (unit < 0 || title < 0) throw new Error(`Framework columns not found: ${head.join(" | ")}`);
  return body.filter((r) => /^\d{4}$/.test(r[unit] ?? "")).map((r) => ({ soc_code: r[unit], title: r[title].trim() }));
}
