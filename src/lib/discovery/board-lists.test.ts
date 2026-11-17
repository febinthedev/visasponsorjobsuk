import { describe, expect, it, vi } from "vitest";
import { ARCHIVE_PATTERNS, archiveBoardKeys, boardKeyFromUrl } from "./board-lists";

describe("archiveBoardKeys", () => {
  const API = "https://index.commoncrawl.org/CC-MAIN-2026-43-index";
  const q = (pattern: string) => `${API}?url=${encodeURIComponent(pattern)}&output=json&fl=url`;
  const line = (url: string) => JSON.stringify({ url });

  it("collects distinct board names from every page of the latest index, skipping failed pages", async () => {
    const routes: Record<string, Response | (() => Response)> = {
      "https://index.commoncrawl.org/collinfo.json": new Response(JSON.stringify([{ "cdx-api": API }])),
      [`${q("jobs.ashbyhq.com/*")}&showNumPages=true`]: new Response(JSON.stringify({ pages: 3 })),
      [`${q("jobs.ashbyhq.com/*")}&page=0`]: new Response(
        [line("https://jobs.ashbyhq.com/deliveroo/1"), line("https://jobs.ashbyhq.com/deliveroo/2"), ""].join("\n"),
      ),
      [`${q("jobs.ashbyhq.com/*")}&page=1`]: new Response("", { status: 503 }),
      [`${q("jobs.ashbyhq.com/*")}&page=2`]: new Response(`${line("https://jobs.ashbyhq.com/Acme")}\n{"url": "trunc`),
    };
    const fetchFn = vi.fn(async (url: string) => {
      const r = routes[url];
      if (!r) throw new Error(`unexpected ${url}`);
      return r instanceof Response ? r : r();
    }) as unknown as typeof fetch;

    expect([...(await archiveBoardKeys("ashby", fetchFn))].sort()).toEqual(["acme", "deliveroo"]);
  });

  it("fails loudly when the archive can't be queried, instead of reporting zero boards (seen 2026-11-17: 504s)", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith("collinfo.json")
        ? new Response(JSON.stringify([{ "cdx-api": API }]))
        : new Response("<html>504 Gateway Time-out</html>", { status: 504 }),
    ) as unknown as typeof fetch;
    await expect(archiveBoardKeys("ashby", fetchFn)).rejects.toThrow(/504/);
  });
});

describe("boardKeyFromUrl", () => {
  it.each([
    ["greenhouse", "https://boards.greenhouse.io/monzo/jobs/6531234", "monzo"],
    ["greenhouse", "https://job-boards.greenhouse.io/Deliveroo", "deliveroo"],
    ["greenhouse", "https://job-boards.eu.greenhouse.io/acme/jobs/1", "acme"],
    ["greenhouse", "https://boards.greenhouse.io/embed/job_board?for=monzo&b=x", "monzo"],
    ["lever", "https://jobs.lever.co/palantir/ac978161-6f46", "palantir"],
    ["lever", "https://jobs.eu.lever.co/acme-ltd", "acme-ltd"],
    ["ashby", "https://jobs.ashbyhq.com/deliveroo/759660a2", "deliveroo"],
    ["workable", "https://apply.workable.com/1000heads/j/060E78B054/", "1000heads"],
    ["smartrecruiters", "https://jobs.smartrecruiters.com/Wise/744000161866279-senior-designer", "wise"],
    ["smartrecruiters", "https://careers.smartrecruiters.com/Wise", "wise"],
  ] as const)("%s: %s → %s", (system, url, key) => {
    expect(boardKeyFromUrl(system, url)).toBe(key);
  });

  it.each([
    ["greenhouse", "https://boards.greenhouse.io/embed/job_app?token=1"],
    ["workable", "https://apply.workable.com/j/060E78B054"],
    ["workable", "https://apply.workable.com/api/v1/widget/accounts/x"],
    ["lever", "https://example.com/palantir"],
    ["greenhouse", "https://boards.greenhouse.io/"],
  ] as const)("%s: %s isn't a board", (system, url) => {
    expect(boardKeyFromUrl(system, url)).toBeNull();
  });
});

describe("ARCHIVE_PATTERNS", () => {
  it("covers each Phase 1 system", () => {
    expect(Object.keys(ARCHIVE_PATTERNS).sort()).toEqual(["ashby", "greenhouse", "lever", "smartrecruiters", "workable"]);
  });
});
