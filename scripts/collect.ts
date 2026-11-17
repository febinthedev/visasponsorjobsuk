// Collects jobs from every matched board in job_sources (Stage D). For each board: read it, keep
// UK jobs, add new ones, update edited ones (they're re-labelled), close ones that disappeared.
// Also closes jobs of employers that left the register or became agencies, and deletes jobs
// closed more than 7 days ago. Collected jobs stay hidden on the site until they're labelled.
//
//   npm run collect                 dry run: read the boards and report UK job counts, write nothing
//   npm run collect -- --apply      write
//   options: --minutes=50 (stop starting boards after this long)
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { ukJobRows } from "@/lib/collect/plan";
import { closeJobsOfIneligibleEmployers, collectSource, deleteClosedJobs, loadSourcesToCollect, type CollectResult, type Source } from "@/lib/collect/store";
import { runQueues } from "@/lib/discovery/runner";
import { READERS, type SourceSystem } from "@/lib/sources";

const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const apply = process.argv.includes("--apply");
const minutes = Number(arg("minutes", "50"));
const KEEP_CLOSED_DAYS = 7; // founder decision
// Polite pace per hiring system; Workable rate-limits hard (see scripts/discover.ts).
const PACE = { intervalMs: 1000, concurrency: 2, perSystem: { workable: { intervalMs: 15_000, concurrency: 1 } } };

async function main(): Promise<number> {
  const startedAt = new Date();
  const [run] = apply ? await db.insert(runs).values({ kind: "jobs", started_at: startedAt }).returning({ id: runs.id }) : [];
  const finish = async (status: "succeeded" | "failed", stats: object, error?: string) => {
    if (run) await db.update(runs).set({ status, stats, error, finished_at: new Date() }).where(eq(runs.id, run.id));
  };

  try {
    console.log(`Job collection — ${apply ? "APPLY" : "dry run"}`);
    const sources = await loadSourcesToCollect();
    const queues: Record<string, Source[]> = {};
    for (const s of sources) (queues[s.system] ??= []).push(s);
    console.log(`    ${sources.length} boards: ${Object.entries(queues).map(([sys, q]) => `${sys} ${q.length}`).join(", ")}`);

    const closedIneligible = apply ? await closeJobsOfIneligibleEmployers(db, startedAt) : 0;

    const results: (CollectResult & { board: string })[] = [];
    const summary = await runQueues(
      queues,
      async (system, source) => {
        const reader = READERS[system as SourceSystem];
        let r: CollectResult;
        if (!reader) {
          r = { result: "error", added: 0, updated: 0, closed: 0, not_uk: 0, error: `no reader for ${system}` };
        } else if (apply) {
          r = await collectSource(db, source, reader, new Date()).catch((e) => ({
            result: "error" as const, added: 0, updated: 0, closed: 0, not_uk: 0, error: (e as Error).message,
          }));
        } else {
          // Dry run: read only, count what would be stored.
          r = await reader(source.board_key)
            .then((b) => {
              if (!b) return { result: "not_found" as const, added: 0, updated: 0, closed: 0, not_uk: 0 };
              const { rows, dropped } = ukJobRows(b.jobs);
              return { result: "ok" as const, added: rows.length, updated: 0, closed: 0, not_uk: dropped };
            })
            .catch((e) => ({ result: "error" as const, added: 0, updated: 0, closed: 0, not_uk: 0, error: (e as Error).message }));
        }
        results.push({ ...r, board: `${system}:${source.board_key}` });
        return { error: r.result === "error" };
      },
      { ...PACE, maxConsecutiveErrors: 10, deadline: startedAt.getTime() + minutes * 60_000 },
    );

    const deleted = apply ? await deleteClosedJobs(db, new Date(Date.now() - KEEP_CLOSED_DAYS * 86_400_000)) : 0;

    const sum = (k: "added" | "updated" | "closed" | "not_uk") => results.reduce((n, r) => n + r[k], 0);
    const count = (res: CollectResult["result"]) => results.filter((r) => r.result === res).length;
    const stats = {
      minutes: Number(((Date.now() - startedAt.getTime()) / 60_000).toFixed(1)),
      boards: sources.length,
      read: count("ok"),
      not_found: count("not_found"),
      errors: count("error"),
      added: sum("added"),
      updated: sum("updated"),
      closed: sum("closed"),
      not_uk: sum("not_uk"),
      closed_ineligible: closedIneligible,
      deleted,
      queues: summary,
      error_boards: results.filter((r) => r.result === "error").map((r) => ({ board: r.board, error: r.error })),
    };

    console.table(Object.fromEntries(results.map((r) => [r.board, { result: r.result, [apply ? "added" : "uk_jobs"]: r.added, updated: r.updated, closed: r.closed, not_uk: r.not_uk }])));
    console.log(stats);
    // Every board failing means something is wrong on our side (network, code): fail the run.
    if (sources.length > 0 && stats.read + stats.not_found === 0) {
      await finish("failed", stats, "every board failed to read");
      return 1;
    }
    await finish("succeeded", stats);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAILED: ${message}`);
    await finish("failed", {}, message);
    return 1;
  }
}

main()
  .then((code) => (process.exitCode = code))
  .finally(() => db.$client.end());
