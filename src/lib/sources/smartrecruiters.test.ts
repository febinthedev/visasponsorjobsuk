import { describe, expect, it } from "vitest";
import { readSmartRecruiters } from "./smartrecruiters";
import { fakeFetch, fixtureJson } from "./test-helpers";

const API = "https://api.smartrecruiters.com/v1/companies";
const LIST = `${API}/wise/postings?limit=100&offset=0`;
const routes = {
  [LIST]: "smartrecruiters-list.json",
  [`${API}/wise/postings/744000161866279`]: "smartrecruiters-detail.json",
  [`${API}/wise/postings/744000161788782`]: "smartrecruiters-detail-2.json",
  // 744000161899958 is in Brazil: its details must never be requested.
};

describe("readSmartRecruiters (Wise's real postings, saved 2026-11-16)", () => {
  it("returns the company name and only the UK postings", async () => {
    const board = await readSmartRecruiters("wise", fakeFetch(routes));
    expect(board?.company_name).toBe("Wise");
    expect(board?.jobs.map((j) => j.external_id)).toEqual(["744000161866279", "744000161788782"]);
  });

  it("maps a posting's details", async () => {
    const raw = fixtureJson("smartrecruiters-detail.json");
    const [job] = (await readSmartRecruiters("wise", fakeFetch(routes)))!.jobs;

    expect(job.title).toBe(raw.name.trim());
    expect(job.apply_url).toBe(raw.postingUrl);
    expect(job.locations).toEqual(["London, United Kingdom"]); // "London, , United Kingdom" tidied
    expect(job.countries).toEqual(["gb"]);
    expect(job.remote).toBe(false);
    expect(job.posted_at).toEqual(new Date(raw.releasedDate));
  });

  it("builds the description from the ad's sections, with their headings", async () => {
    const [job] = (await readSmartRecruiters("wise", fakeFetch(routes)))!.jobs;
    expect(job.description_html).toContain("<h3>Job Description</h3>");
    expect(job.description_text).toContain("Job Description");
    expect(job.description_text).not.toMatch(/<[a-z]/i);
  });

  it("in summary mode, lists UK postings from the list alone, without fetching any details", async () => {
    const listOnly = fakeFetch({ [LIST]: "smartrecruiters-list.json" }); // detail URLs would fail the test
    const board = await readSmartRecruiters("wise", listOnly, { summary: true });
    expect(board?.company_name).toBe("Wise");
    expect(board?.jobs.map((j) => [j.external_id, j.countries, j.locations])).toEqual([
      ["744000161866279", ["gb"], ["London, United Kingdom"]],
      ["744000161788782", ["gb"], ["London, United Kingdom"]],
    ]);
    expect(board?.jobs[0].description_text).toBe("");
  });

  it("treats a name with no postings as no board (the API answers 200 for any name)", async () => {
    const empty = fakeFetch({ [`${API}/zzz/postings?limit=100&offset=0`]: "smartrecruiters-empty.json" });
    expect(await readSmartRecruiters("zzz", empty)).toBeNull();
  });

  it("follows pages until every posting is read", async () => {
    const page1 = `${API}/big/postings?limit=100&offset=0`;
    const page2 = `${API}/big/postings?limit=100&offset=100`;
    const fetchFn = fakeFetch({ [page1]: "smartrecruiters-page1.json", [page2]: "smartrecruiters-page2.json" });
    const board = await readSmartRecruiters("big", fetchFn);
    expect(board?.jobs).toEqual([]); // both pages hold only non-UK postings
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
