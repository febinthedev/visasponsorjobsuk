import { describe, expect, it } from "vitest";
import { readWorkable } from "./workable";
import { fakeFetch, fixtureJson } from "./test-helpers";

const API = "https://apply.workable.com/api/v1/widget/accounts/1000heads?details=true";

describe("readWorkable (1000heads' real board, saved 2026-11-16)", () => {
  const fetchFn = () => fakeFetch({ [API]: "workable.json" });

  it("returns the account's name and every job", async () => {
    const board = await readWorkable("1000heads", fetchFn());
    expect(board?.company_name).toBe("1000heads");
    expect(board?.jobs.map((j) => j.external_id)).toEqual(["060E78B054", "49FD244A31"]);
  });

  it("maps each job, with structured places and country codes", async () => {
    const raw = fixtureJson("workable.json").jobs[0];
    const [uk, us] = (await readWorkable("1000heads", fetchFn()))!.jobs;

    expect(uk.title).toBe("Senior IT Manager");
    expect(uk.apply_url).toBe("https://apply.workable.com/j/060E78B054");
    expect(uk.locations).toEqual(["London, England, United Kingdom"]);
    expect(uk.countries).toEqual(["GB"]);
    expect(us.countries).toEqual(["US"]);
    expect(uk.remote).toBe(false);
    expect(uk.posted_at).toEqual(new Date("2026-10-08"));
    expect(uk.description_html).toBe(raw.description);
    expect(uk.description_text).not.toMatch(/<[a-z]/i);
  });

  it("ignores places the employer has hidden", async () => {
    const data = fixtureJson("workable.json");
    data.jobs[0].locations.push({ country: "France", countryCode: "FR", city: "Paris", region: "", hidden: true });
    const fetchFn = (async () => new Response(JSON.stringify(data))) as unknown as typeof fetch;
    const [uk] = (await readWorkable("1000heads", fetchFn))!.jobs;
    expect(uk.countries).toEqual(["GB"]);
  });

  it("returns null when the account doesn't exist", async () => {
    const none = fakeFetch({ "https://apply.workable.com/api/v1/widget/accounts/nope?details=true": 404 });
    expect(await readWorkable("nope", none)).toBeNull();
  });
});
