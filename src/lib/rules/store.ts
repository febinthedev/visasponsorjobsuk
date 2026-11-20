// Saves the Home Office figures: every occupation code (eligible ones with their going rates), the
// job-title index, and the rule set (salary thresholds) that labels are made with.
import { createHash } from "node:crypto";
import { eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { occupation_titles, occupations, rule_sets } from "@/db/schema";
import type { Occupation } from "./gov-uk";
import type { TitleCode } from "./ons";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RulesInput = {
  thresholds: { general: number; new_entrant: number };
  eligible: Occupation[]; // from gov.uk (Table 1 + Table 3)
  framework: { soc_code: string; title: string }[]; // every ONS occupation code
  titles: TitleCode[]; // ONS coding index
  sources: { occupations: string; skilled_worker: string; coding_index: string };
};

export type RulesResult = { version: string; created: boolean; occupations: number; eligible: number; titles: number; titles_skipped: number };

const BATCH = 5000;

export async function applyRules(conn: Db, input: RulesInput, now: Date): Promise<RulesResult> {
  const codes = new Set(input.framework.map((f) => f.soc_code));
  const unknown = input.eligible.filter((o) => !codes.has(o.soc_code)).map((o) => o.soc_code);
  if (unknown.length) throw new Error(`Eligible occupation codes not in the ONS list: ${unknown.join(", ")}`);

  // Version = fingerprint of the figures: unchanged figures keep their version, any change makes a new one.
  const figures = { thresholds: input.thresholds, eligible: [...input.eligible].sort((a, b) => a.soc_code.localeCompare(b.soc_code)) };
  const version = `r-${createHash("sha256").update(JSON.stringify(figures)).digest("hex").slice(0, 8)}`;

  const eligible = new Map(input.eligible.map((o) => [o.soc_code, o]));
  const occRows = input.framework.map((f) => {
    const e = eligible.get(f.soc_code);
    return {
      soc_code: f.soc_code,
      title: e?.title ?? f.title,
      is_eligible: !!e,
      going_rate: e?.going_rate ?? null,
      new_entrant_going_rate: e?.new_entrant_going_rate ?? null,
      source_url: input.sources.occupations,
      updated_at: now,
    };
  });
  const titles = input.titles.filter((t) => codes.has(t.soc_code));

  await conn
    .insert(occupations)
    .values(occRows)
    .onConflictDoUpdate({
      target: occupations.soc_code,
      set: {
        title: sql`excluded.title`,
        is_eligible: sql`excluded.is_eligible`,
        going_rate: sql`excluded.going_rate`,
        new_entrant_going_rate: sql`excluded.new_entrant_going_rate`,
        source_url: sql`excluded.source_url`,
        updated_at: sql`excluded.updated_at`,
      },
    });

  await conn.delete(occupation_titles);
  for (let i = 0; i < titles.length; i += BATCH) await conn.insert(occupation_titles).values(titles.slice(i, i + BATCH));

  const existed = (await conn.select({ v: rule_sets.version }).from(rule_sets).where(eq(rule_sets.version, version))).length > 0;
  // Only one active rule set at a time: switch the others off first.
  await conn.update(rule_sets).set({ is_active: false }).where(ne(rule_sets.version, version));
  await conn
    .insert(rule_sets)
    .values({
      version,
      general_threshold: input.thresholds.general,
      new_entrant_threshold: input.thresholds.new_entrant,
      effective_from: now.toISOString().slice(0, 10), // the date these figures were read from gov.uk
      source_url: input.sources.skilled_worker,
      notes:
        `Read from gov.uk on ${now.toISOString().slice(0, 10)}. Eligible occupations = Appendix Skilled Occupations Table 1 + Table 3 ` +
        `(Table 3 without going rates yet); shortage lists and PhD options not used (founder decision 2026-11-19). ` +
        `Job titles: ONS SOC 2020 coding index (${input.sources.coding_index}), Open Government Licence v3.0.`,
      is_active: true,
    })
    .onConflictDoUpdate({ target: rule_sets.version, set: { is_active: true } });

  return {
    version,
    created: !existed,
    occupations: occRows.length,
    eligible: input.eligible.length,
    titles: titles.length,
    titles_skipped: input.titles.length - titles.length,
  };
}
