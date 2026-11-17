// Finds which register employers have a job board on Greenhouse, SmartRecruiters, Lever, Ashby or
// Workable, and adds matched boards to job_sources. Boards checked in the last --recheck-days are
// skipped, so repeated runs pick up where the last one stopped.
//
//   npm run discover -- --source=archive                  board names from the Common Crawl archive
//   npm run discover -- --source=guess --sample=2000      guessed names for 2,000 random employers
//   options: --systems=greenhouse,lever  --rate=4 (checks started/second/system)  --concurrency=4  --minutes=110
//            --recheck-days=90  --seed=1  --report=path.json  --apply (write; otherwise a dry run)
import { writeFileSync } from "node:fs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runs, sponsors } from "@/db/schema";
import { archiveBoardKeys, type ArchiveSystem } from "@/lib/discovery/board-lists";
import { candidateKeys } from "@/lib/discovery/candidates";
import { checkBoard, type CheckOutcome } from "@/lib/discovery/check";
import { runQueues } from "@/lib/discovery/runner";
import { loadCheckedKeys, loadSponsorIndex, saveOutcome } from "@/lib/discovery/store";
import { READERS } from "@/lib/sources";

const arg = (name: string, fallback?: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const apply = process.argv.includes("--apply");
const source = arg("source");
// Workable rate-limits hard (measured 2026-11-16: 429s after ~4 quick requests, even at 1 every
// 2 s; 1 every 15 s stayed clean). So it runs at that pace, and name-guessing leaves it out by
// default: 276k guesses at 4/minute would take ~48 days.
const PACE = { workable: { intervalMs: 15_000, concurrency: 1 } };
const defaultSystems = source === "guess" ? "greenhouse,smartrecruiters,lever,ashby" : "greenhouse,smartrecruiters,lever,ashby,workable";
const systems = (arg("systems", defaultSystems) as string).split(",") as ArchiveSystem[];
const rate = Number(arg("rate", "4"));
const concurrency = Number(arg("concurrency", "4"));
const minutes = Number(arg("minutes", "110"));
const recheckDays = Number(arg("recheck-days", "90"));
const sample = arg("sample") ? Number(arg("sample")) : undefined;
const seed = Number(arg("seed", "1"));
const reportPath = arg("report");

// Small seeded shuffle, so a --sample run can be repeated exactly.
function shuffled<T>(items: T[], s: number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const archiveFailures: Record<string, string> = {};

async function buildQueues(checked: Set<string>): Promise<{ queues: Record<string, string[]>; employers?: number }> {
  const fresh = (system: string, keys: Iterable<string>) => [...new Set(keys)].filter((k) => !checked.has(`${system}:${k}`));

  if (source === "archive") {
    const queues: Record<string, string[]> = {};
    for (const system of systems) {
      const keys = await archiveBoardKeys(system).catch((e) => {
        archiveFailures[system] = (e as Error).message;
        console.warn(`    WARNING: archive list for ${system} unavailable: ${(e as Error).message}`);
        return new Set<string>();
      });
      queues[system] = fresh(system, keys);
      console.log(`    ${system}: ${keys.size} board names in the archive, ${queues[system].length} not checked recently`);
    }
    return { queues };
  }

  if (source === "guess") {
    const rows = await db
      .select({ name_normalised: sponsors.name_normalised })
      .from(sponsors)
      .where(and(isNull(sponsors.removed_at), eq(sponsors.is_agency, false)))
      .orderBy(sponsors.id);
    const picked = sample ? shuffled(rows, seed).slice(0, sample) : rows;
    const keys = picked.flatMap((r) => candidateKeys(r.name_normalised));
    const queues = Object.fromEntries(systems.map((s) => [s, fresh(s, keys)]));
    console.log(`    ${picked.length} employers → ${new Set(keys).size} board names per system`);
    return { queues, employers: picked.length };
  }

  throw new Error("Choose --source=archive or --source=guess");
}

async function main(): Promise<number> {
  const startedAt = new Date();
  const [run] = apply ? await db.insert(runs).values({ kind: "discovery", started_at: startedAt }).returning({ id: runs.id }) : [];
  const finish = async (status: "succeeded" | "failed", stats: object, error?: string) => {
    if (run) await db.update(runs).set({ status, stats, error, finished_at: new Date() }).where(eq(runs.id, run.id));
  };

  try {
    console.log(`Discovery (${source}${sample ? `, sample ${sample}` : ""}) — ${apply ? "APPLY" : "dry run"}`);
    const index = await loadSponsorIndex();
    const checked = await loadCheckedKeys(db, new Date(Date.now() - recheckDays * 86_400_000));
    const { queues, employers } = await buildQueues(checked);

    const outcomes: CheckOutcome[] = [];
    const summary = await runQueues(
      queues,
      async (system, key) => {
        const outcome = await checkBoard(system as ArchiveSystem, key, READERS[system as ArchiveSystem]!, index);
        outcomes.push(outcome);
        if (apply) await saveOutcome(db, outcome, new Date());
        return { error: outcome.result === "error" };
      },
      {
        intervalMs: 1000 / rate,
        maxConsecutiveErrors: 10,
        concurrency,
        perSystem: PACE,
        deadline: startedAt.getTime() + minutes * 60_000,
      },
    );

    // Report
    const matched = outcomes.filter((o) => o.result === "matched");
    const names = matched.length
      ? new Map(
          (await db.select({ id: sponsors.id, name: sponsors.name, town: sponsors.town }).from(sponsors).where(inArray(sponsors.id, matched.map((m) => m.sponsor_id!)))).map(
            (s) => [s.id, `${s.name} (${s.town ?? "no town"})`],
          ),
        )
      : new Map();
    const byResult: Record<string, Record<string, number>> = {};
    for (const o of outcomes) (byResult[o.system] ??= {})[o.result] = (byResult[o.system]?.[o.result] ?? 0) + 1;

    const stats = {
      source,
      sample: sample ?? null,
      employers: employers ?? null,
      minutes: Number(((Date.now() - startedAt.getTime()) / 60_000).toFixed(1)),
      checks: outcomes.length,
      matched: matched.length,
      archive_failures: archiveFailures,
      queues: summary,
      by_result: byResult,
    };
    const report = {
      ...stats,
      matched_boards: matched.map((m) => ({
        system: m.system,
        board: m.board_key,
        board_name: m.company_name,
        employer: names.get(m.sponsor_id),
        jobs: m.jobs,
        uk_jobs: m.uk_jobs,
      })),
      ambiguous: outcomes.filter((o) => o.result === "ambiguous").map((o) => ({ system: o.system, board: o.board_key, board_name: o.company_name })),
      no_uk_jobs: outcomes.filter((o) => o.result === "no_uk_jobs").map((o) => ({ system: o.system, board: o.board_key, board_name: o.company_name })),
      errors: outcomes.filter((o) => o.result === "error").map((o) => ({ system: o.system, board: o.board_key, error: o.error })),
    };
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 1));

    console.table(Object.fromEntries(Object.entries(summary).map(([s, q]) => [s, { ...q, ...byResult[s] }])));
    console.log(`Checked ${outcomes.length} boards in ${stats.minutes} min; matched ${matched.length}.`);
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
