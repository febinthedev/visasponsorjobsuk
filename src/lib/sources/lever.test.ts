import { describe, expect, it } from "vitest";
import { readLever } from "./lever";
import { fakeFetch, fixtureJson } from "./test-helpers";

const GLOBAL_API = "https://api.lever.co/v0/postings/palantir?mode=json";
const GLOBAL_PAGE = "https://jobs.lever.co/palantir";
const EU_API = "https://api.eu.lever.co/v0/postings/palantir?mode=json";
const EU_PAGE = "https://jobs.eu.lever.co/palantir";

describe("readLever (Palantir's real postings, saved 2026-11-16)", () => {
  const fetchFn = () => fakeFetch({ [GLOBAL_API]: "lever.json", [GLOBAL_PAGE]: "lever-page.html" });

  it("takes the company name from the board page's title", async () => {
    const board = await readLever("palantir", fetchFn());
    expect(board?.company_name).toBe("Palantir Technologies");
    expect(board?.jobs).toHaveLength(3);
  });

  it("maps each posting, including its country code and remote flag", async () => {
    const raw = fixtureJson("lever.json");
    const jobs = (await readLever("palantir", fetchFn()))!.jobs;

    expect(jobs[0].external_id).toBe(raw[0].id);
    expect(jobs[0].title).toBe(raw[0].text.trim());
    expect(jobs[0].apply_url).toBe(raw[0].hostedUrl);
    expect(jobs[0].locations).toEqual(["London, United Kingdom"]);
    expect(jobs[0].countries).toEqual(["GB"]);
    expect(jobs[0].posted_at).toEqual(new Date(raw[0].createdAt));
    expect(jobs.map((j) => j.countries[0])).toEqual(["GB", "SG", "US"]);
    expect(jobs[2].remote).toBe(true);
    expect(jobs[0].remote).toBe(false);
  });

  it("joins the description, its lists and the closing section", async () => {
    const raw = fixtureJson("lever.json")[0];
    const [job] = (await readLever("palantir", fetchFn()))!.jobs;
    expect(job.description_html).toContain(`<h3>${raw.lists[0].text}</h3>`);
    expect(job.description_text).toContain(raw.lists[1].text);
    expect(job.description_text).not.toMatch(/<[a-z]/i);
  });

  it("falls back to Lever's EU data centre", async () => {
    const eu = fakeFetch({ [GLOBAL_API]: 404, [EU_API]: "lever.json", [EU_PAGE]: "lever-page.html" });
    const board = await readLever("palantir", eu);
    expect(board?.company_name).toBe("Palantir Technologies");
    expect(board?.jobs).toHaveLength(3);
  });

  it("returns null when the board is on neither", async () => {
    const none = fakeFetch({
      "https://api.lever.co/v0/postings/nope?mode=json": 404,
      "https://api.eu.lever.co/v0/postings/nope?mode=json": 404,
    });
    expect(await readLever("nope", none)).toBeNull();
  });
});
