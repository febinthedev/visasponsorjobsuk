import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { job_sources, jobs, sponsors } from "@/db/schema";
import type { Board, BoardJob, BoardReader } from "@/lib/sources/types";
import { closeJobsOfIneligibleEmployers, collectSource, deleteClosedJobs, loadSourcesToCollect, type Source } from "./store";

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

const job = (id: string, extra: Partial<BoardJob> = {}): BoardJob => ({
  external_id: id,
  title: `Engineer ${id}`,
  description_html: "<p>Build things</p>",
  description_text: "Build things",
  apply_url: `https://example.com/jobs/${id}`,
  locations: ["London, UK"],
  countries: [],
  remote: null,
  posted_at: null,
  ...extra,
});
const reader =
  (board: Board | null | Error): BoardReader =>
  async () => {
    if (board instanceof Error) throw board;
    return board;
  };

let n = 0; // each test employer gets its own name (name + town is unique on the register)
async function addSource(tx: Tx, sponsorExtra: Partial<typeof sponsors.$inferInsert> = {}, status = "active"): Promise<Source> {
  n++;
  const [s] = await tx
    .insert(sponsors)
    .values({ name: `ZZ Collect Co ${n}`, name_normalised: `zz collect co ${n}`, town: "Testtown", ...sponsorExtra })
    .returning({ id: sponsors.id });
  const [src] = await tx
    .insert(job_sources)
    .values({ sponsor_id: s.id, system: "greenhouse", board_key: `zz-collect-${s.id}`, status })
    .returning({ id: job_sources.id, sponsor_id: job_sources.sponsor_id, system: job_sources.system, board_key: job_sources.board_key });
  return src as Source;
}
const jobsOf = (tx: Tx, src: Source) => tx.select().from(jobs).where(eq(jobs.source_id, src.id)).orderBy(jobs.external_id);
const sourceRow = async (tx: Tx, src: Source) => (await tx.select().from(job_sources).where(eq(job_sources.id, src.id)))[0];

describe("collectSource", () => {
  it("stores the board's UK jobs only, unlabelled, and records a successful read", async () => {
    await inRollback(async (tx) => {
      const src = await addSource(tx);
      const now = new Date("2026-11-17T06:00:00Z");
      const r = await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("1"), job("2", { locations: ["Paris, France"] })] }), now);
      expect(r).toMatchObject({ result: "ok", added: 1, updated: 0, closed: 0, not_uk: 1 });

      const rows = await jobsOf(tx, src);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ external_id: "1", sponsor_id: src.sponsor_id, locations: ["London, UK"], label: null, closed_at: null });
      expect(await sourceRow(tx, src)).toMatchObject({ status: "active", last_checked_at: now, last_success_at: now, last_error: null });
    });
  });

  it("on the next read: re-labels edited ads, closes missing ones, reopens returning ones", async () => {
    await inRollback(async (tx) => {
      const src = await addSource(tx);
      const t1 = new Date("2026-11-17T00:00:00Z");
      const t2 = new Date("2026-11-17T06:00:00Z");
      const t3 = new Date("2026-11-17T12:00:00Z");
      await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("same"), job("edited"), job("gone")] }), t1);
      // Pretend the labeller has run.
      await tx.update(jobs).set({ label: "open_to_all", label_reason: "test", rules_version: "t", labelled_at: t1 }).where(eq(jobs.source_id, src.id));

      const r = await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("same"), job("edited", { title: "Senior Engineer" })] }), t2);
      expect(r).toMatchObject({ added: 0, updated: 1, closed: 1 });
      const [edited, gone, same] = await jobsOf(tx, src);
      expect(edited).toMatchObject({ title: "Senior Engineer", label: null, labelled_at: null, last_seen_at: t2 });
      expect(gone).toMatchObject({ closed_at: t2, label: "open_to_all" });
      expect(same).toMatchObject({ label: "open_to_all", last_seen_at: t2, first_seen_at: t1 });

      await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("same"), job("edited", { title: "Senior Engineer" }), job("gone")] }), t3);
      expect((await jobsOf(tx, src))[1]).toMatchObject({ external_id: "gone", closed_at: null, last_seen_at: t3 });
    });
  });

  it("a failed read marks the board 'error' and leaves its jobs alone", async () => {
    await inRollback(async (tx) => {
      const src = await addSource(tx);
      await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("1")] }), new Date("2026-11-17T00:00:00Z"));
      const now = new Date("2026-11-17T06:00:00Z");
      const r = await collectSource(tx, src, reader(new Error("GET x failed: 503")), now);
      expect(r).toMatchObject({ result: "error", error: "GET x failed: 503" });
      expect(await sourceRow(tx, src)).toMatchObject({ status: "error", last_checked_at: now, last_error: "GET x failed: 503" });
      expect((await jobsOf(tx, src))[0].closed_at).toBeNull();
    });
  });

  it("a board that no longer exists is marked 'not_found' and its jobs are closed", async () => {
    await inRollback(async (tx) => {
      const src = await addSource(tx);
      await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("1")] }), new Date("2026-11-17T00:00:00Z"));
      const now = new Date("2026-11-17T06:00:00Z");
      expect(await collectSource(tx, src, reader(null), now)).toMatchObject({ result: "not_found", closed: 1 });
      expect((await sourceRow(tx, src)).status).toBe("not_found");
      expect((await jobsOf(tx, src))[0].closed_at).toEqual(now);
    });
  });
});

describe("loadSourcesToCollect", () => {
  it("returns boards of live, non-agency employers, except ambiguous ones", async () => {
    await inRollback(async (tx) => {
      const ok = await addSource(tx);
      const errored = await addSource(tx, {}, "error");
      const ambiguous = await addSource(tx, {}, "ambiguous");
      const agency = await addSource(tx, { is_agency: true, agency_reason: "test" });
      const removed = await addSource(tx, { removed_at: new Date() });
      const ids = (await loadSourcesToCollect(tx)).map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining([ok.id, errored.id]));
      for (const s of [ambiguous, agency, removed]) expect(ids).not.toContain(s.id);
    });
  });
});

describe("closeJobsOfIneligibleEmployers", () => {
  it("closes live jobs of employers that became agencies or left the register", async () => {
    await inRollback(async (tx) => {
      const t0 = new Date("2026-11-17T00:00:00Z");
      const kept = await addSource(tx);
      const left = await addSource(tx);
      for (const s of [kept, left]) await collectSource(tx, s, reader({ company_name: "ZZ", jobs: [job("1")] }), t0);
      await tx.update(sponsors).set({ removed_at: t0 }).where(eq(sponsors.id, left.sponsor_id));

      const now = new Date("2026-11-17T06:00:00Z");
      expect(await closeJobsOfIneligibleEmployers(tx, now)).toBeGreaterThanOrEqual(1);
      expect((await jobsOf(tx, left))[0].closed_at).toEqual(now);
      expect((await jobsOf(tx, kept))[0].closed_at).toBeNull();
    });
  });
});

describe("deleteClosedJobs", () => {
  it("deletes jobs closed before the cut-off, keeps recently closed and live ones", async () => {
    await inRollback(async (tx) => {
      const src = await addSource(tx);
      await collectSource(tx, src, reader({ company_name: "ZZ", jobs: [job("old"), job("recent"), job("live")] }), new Date("2026-11-01"));
      const [live, old, recent] = await jobsOf(tx, src);
      await tx.update(jobs).set({ closed_at: new Date("2026-11-05") }).where(eq(jobs.id, old.id));
      await tx.update(jobs).set({ closed_at: new Date("2026-11-15") }).where(eq(jobs.id, recent.id));

      await deleteClosedJobs(tx, new Date("2026-11-10"));
      expect((await jobsOf(tx, src)).map((j) => j.id)).toEqual([live.id, recent.id]);
    });
  });
});
