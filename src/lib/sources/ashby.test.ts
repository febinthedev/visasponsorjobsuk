import { describe, expect, it } from "vitest";
import { readAshby } from "./ashby";
import { fakeFetch, fixtureJson } from "./test-helpers";

const API = "https://api.ashbyhq.com/posting-api/job-board/deliveroo";
const PAGE = "https://jobs.ashbyhq.com/deliveroo";

describe("readAshby (Deliveroo's real board, saved 2026-11-16)", () => {
  const fetchFn = () => fakeFetch({ [API]: "ashby.json", [PAGE]: "ashby-page.html" });

  it("takes the company name from the board page's title, without the word 'Jobs'", async () => {
    const board = await readAshby("deliveroo", fetchFn());
    expect(board?.company_name).toBe("Deliveroo");
    expect(board?.jobs).toHaveLength(3);
  });

  it("maps each job, using the structured country from its address", async () => {
    const raw = fixtureJson("ashby.json").jobs[0];
    const [job] = (await readAshby("deliveroo", fetchFn()))!.jobs;

    expect(job.external_id).toBe(raw.id);
    expect(job.title).toBe(raw.title.trim());
    expect(job.apply_url).toBe(raw.jobUrl);
    expect(job.locations).toEqual(["Brighton - St Josephs Business Park (Hop)"]);
    expect(job.countries).toEqual(["United Kingdom"]);
    expect(job.remote).toBe(false);
    expect(job.posted_at).toEqual(new Date(raw.publishedAt));
    expect(job.description_html).toBe(raw.descriptionHtml);
    expect(job.description_text.length).toBeGreaterThan(100);
  });

  it("skips jobs the employer has unlisted", async () => {
    const data = fixtureJson("ashby.json");
    data.jobs[1].isListed = false;
    const fetchFn = Object.assign(
      async (url: string) =>
        url === API ? new Response(JSON.stringify(data)) : new Response("<title>Deliveroo Jobs</title>"),
      {},
    ) as unknown as typeof fetch;
    expect((await readAshby("deliveroo", fetchFn))!.jobs).toHaveLength(2);
  });

  it("returns null when the board doesn't exist", async () => {
    expect(await readAshby("nope", fakeFetch({ "https://api.ashbyhq.com/posting-api/job-board/nope": 404 }))).toBeNull();
  });
});
