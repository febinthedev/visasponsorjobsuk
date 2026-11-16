import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import type { RegisterSponsor } from "./group";
import { applySync, planSync } from "./sync";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class Rollback extends Error {}

// Runs fn inside a transaction that is always rolled back, so the real database is left untouched.
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const P = "zz test sponsor "; // prefix so these rows never mix with real ones
const s = (n: string, extra: Partial<RegisterSponsor> = {}): RegisterSponsor => ({
  name: `${P}${n} Ltd`,
  name_normalised: `${P}${n}`,
  town: "Testtown",
  county: null,
  routes: ["Skilled Worker"],
  rating: "a",
  is_agency: false,
  agency_reason: null,
  ...extra,
});
const testRows = (tx: Tx) => tx.select().from(sponsors).where(like(sponsors.name_normalised, `${P}%`));
// Same shape as loadExisting(), but only this test's rows: the real table holds ~127k employers.
const existingTestRows = (tx: Tx) =>
  tx
    .select({ id: sponsors.id, name_normalised: sponsors.name_normalised, town: sponsors.town, removed_at: sponsors.removed_at })
    .from(sponsors)
    .where(like(sponsors.name_normalised, `${P}%`));

afterAll(async () => {
  await db.$client.end();
});

describe("applySync", () => {
  it("handles new, changed, removed and returning employers across two days", async () => {
    const day1 = new Date("2026-11-01T06:00:00Z");
    const day2 = new Date("2026-11-02T06:00:00Z");

    await inRollback(async (tx) => {
      await applySync(tx, planSync(await existingTestRows(tx), [s("stays"), s("leaves"), s("changes")]), day1);
      expect(await testRows(tx)).toHaveLength(3);

      const plan2 = planSync(await existingTestRows(tx), [
        s("stays"),
        s("changes", { routes: ["Creative Worker", "Skilled Worker"], county: "Testshire", rating: "b" }),
        s("joins"),
      ]);
      expect(plan2.removeIds).toHaveLength(1);
      await applySync(tx, plan2, day2);

      const rows = Object.fromEntries((await testRows(tx)).map((r) => [r.name_normalised.slice(P.length), r]));
      expect(Object.keys(rows).sort()).toEqual(["changes", "joins", "leaves", "stays"]);

      expect(rows.stays.first_seen_at).toEqual(day1);
      expect(rows.stays.last_seen_at).toEqual(day2);
      expect(rows.stays.removed_at).toBeNull();

      expect(rows.leaves.removed_at).toEqual(day2); // kept, marked removed, never deleted
      expect(rows.leaves.last_seen_at).toEqual(day1);

      expect(rows.changes.routes).toEqual(["Creative Worker", "Skilled Worker"]);
      expect(rows.changes.county).toBe("Testshire");
      expect(rows.stays.rating).toBe("a"); // stored on insert
      expect(rows.changes.rating).toBe("b"); // downgrade picked up on update

      expect(rows.joins.first_seen_at).toEqual(day2);

      // Day 3: the removed employer returns.
      const day3 = new Date("2026-11-03T06:00:00Z");
      const plan3 = planSync(await existingTestRows(tx), [s("stays"), s("changes"), s("joins"), s("leaves")]);
      expect(plan3.reactivated).toBe(1);
      await applySync(tx, plan3, day3);
      const back = (await testRows(tx)).find((r) => r.name_normalised === `${P}leaves`)!;
      expect(back.removed_at).toBeNull();
      expect(back.last_seen_at).toEqual(day3);
    });
  });

  it("stores agency flags and a blank town", async () => {
    await inRollback(async (tx) => {
      await applySync(
        tx,
        planSync([], [s("agency", { is_agency: true, agency_reason: 'name contains "recruitment"', town: null })]),
        new Date(),
      );
      const [row] = await testRows(tx);
      expect(row.is_agency).toBe(true);
      expect(row.agency_reason).toBe('name contains "recruitment"');
      expect(row.town).toBeNull();
    });
  });
});
