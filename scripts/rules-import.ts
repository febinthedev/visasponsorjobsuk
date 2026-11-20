// Loads the Home Office figures labels are made with (blueprint step 4): salary thresholds from
// Appendix Skilled Worker, eligible occupations and going rates from Appendix Skilled Occupations,
// and the ONS SOC 2020 coding index (job title → occupation code). Run it by hand when gov.uk
// changes the rules; figures that haven't changed keep their rule-set version.
//
//   npm run rules:import             dry run: download, read and report; write nothing
//   npm run rules:import -- --apply  write
import { db } from "@/db";
import { parseOccupations, parseThresholds } from "@/lib/rules/gov-uk";
import { parseCodingIndex, parseFramework } from "@/lib/rules/ons";
import { applyRules, type RulesInput } from "@/lib/rules/store";
import { readSheet } from "@/lib/rules/xlsx";
import { USER_AGENT } from "@/lib/sources/http";

const apply = process.argv.includes("--apply");
const OCCUPATIONS = "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations";
const SKILLED_WORKER = "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-worker";
const ONS_PAGE =
  "https://www.ons.gov.uk/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions";

async function download(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res;
}

async function main(): Promise<number> {
  console.log(`Rules import — ${apply ? "APPLY" : "dry run"}`);
  const [occHtml, swHtml, onsHtml] = await Promise.all([OCCUPATIONS, SKILLED_WORKER, ONS_PAGE].map(async (u) => (await download(u)).text()));

  // The coding index file name carries a version stamp, so take the current link from the ONS page.
  const href = onsHtml.match(/href="([^"]*soc2020volume2thecodingindexexcel[^"]*\.xlsx)"/)?.[1];
  if (!href) throw new Error("Coding index download link not found on the ONS page");
  const indexUrl = new URL(href.replace(/&amp;/g, "&"), ONS_PAGE).toString();
  const xlsx = new Uint8Array(await (await download(indexUrl)).arrayBuffer());

  const thresholds = parseThresholds(swHtml);
  const eligible = parseOccupations(occHtml);
  const framework = parseFramework(readSheet(xlsx, "SOC2020 framework"));
  const index = parseCodingIndex(readSheet(xlsx, "SOC2020 coding index"));

  const input: RulesInput = {
    thresholds,
    eligible,
    framework,
    titles: index.titles,
    sources: { occupations: OCCUPATIONS, skilled_worker: SKILLED_WORKER, coding_index: indexUrl },
  };

  const withRate = eligible.filter((o) => o.going_rate !== null);
  console.log(`    thresholds: general £${thresholds.general.toLocaleString("en-GB")}, new entrant £${thresholds.new_entrant.toLocaleString("en-GB")}`);
  console.log(`    eligible occupations: ${eligible.length} (${withRate.length} with going rates, ${eligible.length - withRate.length} health/education without)`);
  console.log(`    ONS occupation codes: ${framework.length}; job titles: ${index.titles.length} title→code pairs (${index.skipped} index rows without a code)`);
  console.log(`    coding index: ${indexUrl}`);
  console.table(
    ["2134", "2136", "2421", "2231", "4122"].map((c) => {
      const e = eligible.find((o) => o.soc_code === c);
      return { code: c, title: (e ?? framework.find((f) => f.soc_code === c))?.title, eligible: !!e, going_rate: e?.going_rate ?? null, new_entrant_rate: e?.new_entrant_going_rate ?? null };
    }),
  );

  if (!apply) return 0;
  const result = await db.transaction((tx) => applyRules(tx, input, new Date()));
  console.log(result.created ? `Saved new rule set ${result.version} (now active).` : `Figures unchanged: rule set ${result.version} stays active.`, result);
  return 0;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((err) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end({ timeout: 10 }));
