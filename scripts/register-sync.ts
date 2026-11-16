// Downloads the Home Office register of licensed sponsors and syncs it into the `sponsors` table.
//
//   npm run register:sync                      dry run: download, compare, print the changes; writes nothing
//   npm run register:sync -- --apply           write the changes and log the run in `runs`
//   npm run register:sync -- --apply --force   also skip the safety check (only if you've checked why it failed)
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { parseCsv } from "@/lib/register/csv";
import { groupRegister } from "@/lib/register/group";
import { parseTypeRating } from "@/lib/register/rating";
import { downloadRegister } from "@/lib/register/source";
import { applySync, checkSafety, loadExisting, planSync } from "@/lib/register/sync";

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

async function main(): Promise<number> {
  const startedAt = new Date();
  const [run] = apply ? await db.insert(runs).values({ kind: "register", started_at: startedAt }).returning({ id: runs.id }) : [];
  const finish = async (status: "succeeded" | "failed", stats: object, error?: string) => {
    if (run) await db.update(runs).set({ status, stats, error, finished_at: new Date() }).where(eq(runs.id, run.id));
  };

  try {
    console.log("1/4 Finding and downloading today's register…");
    const { url, text } = await downloadRegister();
    console.log(`    ${url}`);

    console.log("2/4 Reading and grouping rows…");
    const rows = parseCsv(text);
    const incoming = groupRegister(rows);
    const agencies = incoming.filter((s) => s.is_agency);
    const rated = (r: string | null) => incoming.filter((s) => s.rating === r).length;
    // "Type & Rating" wordings we couldn't read: these employers can never be labelled green,
    // so a new wording from GOV.UK shows up here and in the run log.
    const unrecognised = [...new Set(rows.slice(1).map((r) => r[3] ?? ""))].filter(
      (v) => parseTypeRating(v).rating === null,
    );

    console.log("3/4 Comparing with the database…");
    const plan = planSync(await loadExisting(), incoming);

    const stats = {
      file_url: url,
      rows: rows.length - 1,
      employers: incoming.length,
      agencies: agencies.length,
      rating_a: rated("a"),
      rating_b: rated("b"),
      rating_provisional: rated("provisional"),
      no_worker_rating: rated(null),
      unrecognised_wordings: unrecognised.join(" | ") || "none",
      live_before: plan.liveBefore,
      new: plan.inserts.length,
      still_listed: plan.updates.length - plan.reactivated,
      back_on_register: plan.reactivated,
      removed: plan.removeIds.length,
    };
    console.table(stats);
    console.log("    Sample agencies:", agencies.slice(0, 5).map((a) => `${a.name} (${a.agency_reason})`));

    const problem = checkSafety({
      incomingCount: incoming.length,
      removeCount: plan.removeIds.length,
      liveBefore: plan.liveBefore,
    });
    if (problem && !force) {
      console.error(`STOPPED by safety check: ${problem}`);
      await finish("failed", stats, `Safety check: ${problem}`);
      return 1;
    }
    if (problem) console.warn(`Safety check overridden with --force: ${problem}`);

    if (!apply) {
      console.log("4/4 Dry run: nothing was written. Re-run with --apply to save these changes.");
      return 0;
    }

    console.log("4/4 Writing changes (one transaction)…");
    await db.transaction((tx) => applySync(tx, plan, startedAt));
    await finish("succeeded", stats);
    console.log(`Done in ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s.`);
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
