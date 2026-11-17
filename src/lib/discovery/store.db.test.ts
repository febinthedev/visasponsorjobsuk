import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discovery_checks, job_sources, sponsors } from "@/db/schema";
import { loadCheckedKeys, loadSponsorIndex, saveOutcome } from "./store";

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

const KEY = "zz-test-board"; // board names used only by this test
const addSponsor = async (tx: Tx, name_normalised: string, extra: Partial<typeof sponsors.$inferInsert> = {}) => {
  const [row] = await tx
    .insert(sponsors)
    .values({ name: name_normalised, name_normalised, town: "Testtown", ...extra })
    .returning({ id: sponsors.id });
  return row.id;
};

afterAll(async () => {
  await db.$client.end();
});

describe("saveOutcome", () => {
  it("records every check, and adds matched boards to job_sources as active", async () => {
    await inRollback(async (tx) => {
      const sponsorId = await addSponsor(tx, "zz test discovery co");
      const now = new Date("2026-11-17T01:00:00Z");
      await saveOutcome(tx, { system: "greenhouse", board_key: KEY, result: "matched", company_name: "ZZ Test", sponsor_id: sponsorId }, now);

      const [check] = await tx.select().from(discovery_checks).where(and(eq(discovery_checks.system, "greenhouse"), eq(discovery_checks.board_key, KEY)));
      expect(check).toEqual({ system: "greenhouse", board_key: KEY, result: "matched", company_name: "ZZ Test", checked_at: now });

      const [source] = await tx.select().from(job_sources).where(eq(job_sources.board_key, KEY));
      expect(source).toMatchObject({ sponsor_id: sponsorId, system: "greenhouse", status: "active" });
    });
  });

  it("updates a re-checked board instead of adding a second row", async () => {
    await inRollback(async (tx) => {
      await saveOutcome(tx, { system: "lever", board_key: KEY, result: "not_found", company_name: null }, new Date("2026-01-01"));
      await saveOutcome(tx, { system: "lever", board_key: KEY, result: "no_match", company_name: "Someone" }, new Date("2026-02-01"));
      const rows = await tx.select().from(discovery_checks).where(eq(discovery_checks.board_key, KEY));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ result: "no_match", company_name: "Someone", checked_at: new Date("2026-02-01") });
      expect(await tx.select().from(job_sources).where(eq(job_sources.board_key, KEY))).toHaveLength(0);
    });
  });
});

describe("loadCheckedKeys", () => {
  it("returns boards checked since a date, as 'system:board'", async () => {
    await inRollback(async (tx) => {
      await saveOutcome(tx, { system: "ashby", board_key: KEY, result: "not_found", company_name: null }, new Date("2026-11-10"));
      await saveOutcome(tx, { system: "workable", board_key: KEY, result: "not_found", company_name: null }, new Date("2026-01-10"));
      const keys = await loadCheckedKeys(tx, new Date("2026-06-01"));
      expect(keys.has(`ashby:${KEY}`)).toBe(true);
      expect(keys.has(`workable:${KEY}`)).toBe(false); // checked too long ago: due again
    });
  });

  it("re-checks boards that fit an employer but had no UK jobs sooner (weekly), founder decision 2026-11-17", async () => {
    await inRollback(async (tx) => {
      const day = 86_400_000;
      const now = Date.now();
      await saveOutcome(tx, { system: "greenhouse", board_key: `${KEY}-a`, result: "no_uk_jobs", company_name: "A" }, new Date(now - 10 * day));
      await saveOutcome(tx, { system: "greenhouse", board_key: `${KEY}-b`, result: "no_uk_jobs", company_name: "B" }, new Date(now - 3 * day));
      await saveOutcome(tx, { system: "greenhouse", board_key: `${KEY}-c`, result: "not_found", company_name: null }, new Date(now - 10 * day));
      const keys = await loadCheckedKeys(tx, new Date(now - 90 * day), new Date(now - 7 * day));
      expect(keys.has(`greenhouse:${KEY}-a`)).toBe(false); // no UK jobs, over a week ago: due again
      expect(keys.has(`greenhouse:${KEY}-b`)).toBe(true); // checked this week
      expect(keys.has(`greenhouse:${KEY}-c`)).toBe(true); // other results keep the 90-day wait
    });
  });

  it("leaves out failed checks (e.g. rate limited), so they're retried on the next run", async () => {
    await inRollback(async (tx) => {
      await saveOutcome(tx, { system: "workable", board_key: KEY, result: "error", company_name: null }, new Date());
      expect((await loadCheckedKeys(tx, new Date("2026-01-01"))).has(`workable:${KEY}`)).toBe(false);
    });
  });
});

describe("loadSponsorIndex", () => {
  it("indexes live employers only, never agencies or removed ones", async () => {
    await inRollback(async (tx) => {
      await addSponsor(tx, "zzqx live employer");
      await addSponsor(tx, "zzqx agency staffing", { is_agency: true, agency_reason: "test" });
      await addSponsor(tx, "zzqx gone employer", { removed_at: new Date() });
      const names = (await loadSponsorIndex(tx)).get("zzqx")?.map((s) => s.name);
      expect(names).toEqual(["zzqx live employer"]);
    });
  });
});
