// Reads the Home Office figures from the gov.uk Immigration Rules pages:
// - Appendix Skilled Occupations: which occupations can be sponsored, and their going rates;
// - Appendix Skilled Worker: the general and new-entrant salary thresholds.
// Anything unexpected in the page layout throws, so wrong figures are never loaded quietly.
import { decodeEntities } from "@/lib/sources/html";

export type GovTable = { heading: string; header: string[]; rows: string[][] };

export type Occupation = {
  soc_code: string;
  title: string;
  going_rate: number | null; // £/year for a 37.5-hour week; null = set by national pay scales (Table 3)
  new_entrant_going_rate: number | null; // the 70% column (already at least £17.13/hour)
};

const cellText = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
const cells = (rowHtml: string) => [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cellText(m[1]));
const pounds = (cell: string) => {
  const m = cell.match(/£([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

// Every table on the page, with the <h2> heading just before it.
export function readTables(html: string): GovTable[] {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => {
    const headings = [...html.slice(0, m.index).matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
    const trs = [...m[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => cells(r[1]));
    return { heading: headings.length ? cellText(headings[headings.length - 1][1]) : "", header: trs[0] ?? [], rows: trs.slice(1) };
  });
}

const findTable = (tables: GovTable[], prefix: string) => {
  const t = tables.find((t) => t.heading.startsWith(prefix));
  if (!t) throw new Error(`${prefix} not found on the page`);
  return t;
};
const NATION = /\s*\((England|Scotland|Wales|Northern Ireland)\)$/;
const codeAndTitle = (cell: string, table: string) => {
  const m = cell.match(/^(\d{4})\s+([\s\S]+)$/);
  if (!m) throw new Error(`${table}: unexpected occupation cell "${cell}"`);
  return { soc_code: m[1], title: m[2].replace(/\s+/g, " ").replace(NATION, "") };
};

// Occupations a new applicant can be sponsored for: Table 1 (degree level) and Table 3 (health and
// education). Founder decisions 2026-11-19: Table 1a/2* (only for people already sponsored) and the
// shortage lists are left out; Table 3 has no going rate until pay bands are handled (NHS, Phase 2).
export function parseOccupations(html: string): Occupation[] {
  const tables = readTables(html);
  const t1 = findTable(tables, "Table 1:");
  const col = (text: string) => t1.header.findIndex((h) => h.includes(text));
  const [rate, rate70] = [col("Going rate (SW – options A"), col("70% of going rate (SW – option E)")];
  if (rate < 0 || rate70 < 0) throw new Error(`Table 1 layout changed: ${t1.header.join(" | ")}`);

  const out: Occupation[] = t1.rows.map((r) => {
    const occ = codeAndTitle(r[0], "Table 1");
    const going_rate = pounds(r[rate]);
    if (!going_rate) throw new Error(`Table 1: no going rate for ${occ.soc_code}`);
    return { ...occ, going_rate, new_entrant_going_rate: pounds(r[rate70]) };
  });

  const t3 = findTable(tables, "Table 3:");
  for (const r of t3.rows) {
    const occ = codeAndTitle(r[0], "Table 3"); // listed once per UK nation: keep one
    if (!out.some((o) => o.soc_code === occ.soc_code)) out.push({ ...occ, going_rate: null, new_entrant_going_rate: null });
  }
  return out;
}

// The salary floors from the points table: option A (general) and option E (new entrant).
export function parseThresholds(html: string): { general: number; new_entrant: number } {
  const options = readTables(html).find((t) => t.header[0] === "Option" && t.header[1] === "Requirements");
  const amount = (option: string) => {
    const v = pounds(options?.rows.find((r) => r[0] === option)?.[1] ?? "");
    if (!v) throw new Error(`Salary threshold for option ${option} not found`);
    return v;
  };
  return { general: amount("A"), new_entrant: amount("E") };
}
