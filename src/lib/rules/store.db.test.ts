import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { occupation_titles, occupations, rule_sets } from "@/db/schema";
import { applyRules, type RulesInput } from "./store";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class Rollback extends Error {}
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

afterAll(async () => {
  await db.$client.end();
});

const input = (extra: Partial<RulesInput> = {}): RulesInput => ({
  thresholds: { general: 41700, new_entrant: 33400 },
  eligible: [
    { soc_code: "2134", title: "Programmers and software development professionals", going_rate: 54700, new_entrant_going_rate: 38300 },
    { soc_code: "2231", title: "Midwifery nurses", going_rate: null, new_entrant_going_rate: null },
  ],
  framework: [
    { soc_code: "2134", title: "Programmers and software development professionals" },
    { soc_code: "2231", title: "Midwifery nurses" },
    { soc_code: "4122", title: "Book-keepers, payroll managers and wages clerks" },
  ],
  titles: [
    { title_normalised: "software developer", soc_code: "2134" },
    { title_normalised: "accountant", soc_code: "4122" },
    { title_normalised: "lord", soc_code: "9999" }, // code not in the framework: skipped
  ],
  sources: { occupations: "https://gov.uk/occ", skilled_worker: "https://gov.uk/sw", coding_index: "https://ons.gov.uk/index.xlsx" },
  ...extra,
});
const NOW = new Date("2026-11-19T12:00:00Z");
const CODES = ["2134", "2231", "4122"];

describe("applyRules", () => {
  it("loads every occupation code, marks the eligible ones with their rates, loads titles and activates the rule set", async () => {
    await inRollback(async (tx) => {
      const r = await applyRules(tx, input(), NOW);
      expect(r).toMatchObject({ created: true, occupations: 3, eligible: 2, titles: 2, titles_skipped: 1 });

      const occ = await tx.select().from(occupations).where(inArray(occupations.soc_code, CODES)).orderBy(occupations.soc_code);
      expect(occ.map((o) => [o.soc_code, o.is_eligible, o.going_rate, o.new_entrant_going_rate])).toEqual([
        ["2134", true, 54700, 38300],
        ["2231", true, null, null],
        ["4122", false, null, null],
      ]);
      expect(occ[0].source_url).toBe("https://gov.uk/occ");

      const titles = await tx.select().from(occupation_titles).orderBy(occupation_titles.title_normalised);
      expect(titles.map((t) => [t.title_normalised, t.soc_code])).toEqual([["accountant", "4122"], ["software developer", "2134"]]);

      const active = await tx.select().from(rule_sets).where(eq(rule_sets.is_active, true));
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({ version: r.version, general_threshold: 41700, new_entrant_threshold: 33400, source_url: "https://gov.uk/sw" });
    });
  });

  it("keeps the same version when the figures haven't changed, and makes a new active one when they have", async () => {
    await inRollback(async (tx) => {
      const first = await applyRules(tx, input(), NOW);
      const again = await applyRules(tx, input(), new Date("2026-11-20"));
      expect(again).toMatchObject({ version: first.version, created: false });

      const changed = await applyRules(tx, input({ thresholds: { general: 45000, new_entrant: 36000 } }), new Date("2026-12-01"));
      expect(changed.created).toBe(true);
      expect(changed.version).not.toBe(first.version);
      const active = await tx.select({ version: rule_sets.version }).from(rule_sets).where(eq(rule_sets.is_active, true));
      expect(active).toEqual([{ version: changed.version }]);
    });
  });

  it("refuses to load an eligible occupation that isn't an ONS code", async () => {
    await inRollback(async (tx) => {
      const bad = input({ eligible: [{ soc_code: "1234", title: "Made up", going_rate: 1, new_entrant_going_rate: 1 }] });
      await expect(applyRules(tx, bad, NOW)).rejects.toThrow(/1234/); // checked before anything is written
    });
  });
});
