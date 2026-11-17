// Database side of job collection: read one board, store its UK jobs (new, edited, closed,
// reopened), and the clean-ups that run around it.
import { and, eq, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { job_sources, jobs, sponsors } from "@/db/schema";
import type { BoardReader } from "@/lib/sources/types";
import { planBoard, ukJobRows } from "./plan";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Source = { id: number; sponsor_id: number; system: string; board_key: string };
export type CollectResult = {
  result: "ok" | "not_found" | "error";
  added: number;
  updated: number;
  closed: number;
  not_uk: number; // jobs on the board that aren't in the UK (not stored)
  error?: string;
};

// Boards to read: every board except ambiguous ones, of employers still on the register and not
// agencies. Boards marked error or not_found are tried again, so they recover by themselves.
export async function loadSourcesToCollect(conn: Db = db): Promise<Source[]> {
  return conn
    .select({ id: job_sources.id, sponsor_id: job_sources.sponsor_id, system: job_sources.system, board_key: job_sources.board_key })
    .from(job_sources)
    .innerJoin(sponsors, eq(sponsors.id, job_sources.sponsor_id))
    .where(and(ne(job_sources.status, "ambiguous"), isNull(sponsors.removed_at), eq(sponsors.is_agency, false)))
    .orderBy(job_sources.id);
}

export async function collectSource(conn: Db, source: Source, reader: BoardReader, now: Date): Promise<CollectResult> {
  const counts = { added: 0, updated: 0, closed: 0, not_uk: 0 };
  let board;
  try {
    board = await reader(source.board_key);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Jobs are left alone: a failed read says nothing about whether they're still open.
    await conn.update(job_sources).set({ status: "error", last_checked_at: now, last_error: error }).where(eq(job_sources.id, source.id));
    return { result: "error", ...counts, error };
  }

  return conn.transaction(async (tx) => {
    if (!board) {
      // The board is gone, so are its jobs.
      const closed = await tx
        .update(jobs)
        .set({ closed_at: now })
        .where(and(eq(jobs.source_id, source.id), isNull(jobs.closed_at)))
        .returning({ id: jobs.id });
      await tx.update(job_sources).set({ status: "not_found", last_checked_at: now, last_error: null }).where(eq(job_sources.id, source.id));
      return { result: "not_found" as const, ...counts, closed: closed.length };
    }

    const { rows, dropped } = ukJobRows(board.jobs);
    const existing = await tx
      .select({ id: jobs.id, external_id: jobs.external_id, content_hash: jobs.content_hash, closed_at: jobs.closed_at })
      .from(jobs)
      .where(eq(jobs.source_id, source.id));
    const plan = planBoard(existing, rows);

    if (plan.insert.length) {
      await tx
        .insert(jobs)
        .values(plan.insert.map((r) => ({ ...r, source_id: source.id, sponsor_id: source.sponsor_id, first_seen_at: now, last_seen_at: now })));
    }
    for (const { id, ...r } of plan.update) {
      // An edited ad is labelled again from scratch: hidden until the labeller has re-read it.
      await tx
        .update(jobs)
        .set({ ...r, label: null, label_reason: null, label_evidence: null, rules_version: null, labelled_at: null, last_seen_at: now, closed_at: null })
        .where(eq(jobs.id, id));
    }
    if (plan.seenIds.length) await tx.update(jobs).set({ last_seen_at: now, closed_at: null }).where(inArray(jobs.id, plan.seenIds));
    if (plan.closeIds.length) await tx.update(jobs).set({ closed_at: now }).where(inArray(jobs.id, plan.closeIds));

    await tx
      .update(job_sources)
      .set({ status: "active", last_checked_at: now, last_success_at: now, last_error: null })
      .where(eq(job_sources.id, source.id));
    return { result: "ok" as const, added: plan.insert.length, updated: plan.update.length, closed: plan.closeIds.length, not_uk: dropped };
  });
}

// Employers that became agencies or left the register (licence revoked or surrendered): their
// live jobs close straight away. Returns how many were closed.
export async function closeJobsOfIneligibleEmployers(conn: Db, now: Date): Promise<number> {
  const ineligible = conn
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(or(isNotNull(sponsors.removed_at), eq(sponsors.is_agency, true)));
  const closed = await conn
    .update(jobs)
    .set({ closed_at: now })
    .where(and(isNull(jobs.closed_at), inArray(jobs.sponsor_id, ineligible)))
    .returning({ id: jobs.id });
  return closed.length;
}

// Jobs are kept 7 days after closing (founder decision), then deleted. Returns how many.
export async function deleteClosedJobs(conn: Db, closedBefore: Date): Promise<number> {
  const deleted = await conn.delete(jobs).where(lt(jobs.closed_at, closedBefore)).returning({ id: jobs.id });
  return deleted.length;
}
