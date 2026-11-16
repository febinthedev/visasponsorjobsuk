import { describe, expect, it } from "vitest";
import { readGreenhouse } from "./greenhouse";
import { fakeFetch, fixtureJson } from "./test-helpers";

const BOARD = "https://boards-api.greenhouse.io/v1/boards/monzo";
const JOBS = "https://boards-api.greenhouse.io/v1/boards/monzo/jobs?content=true";

describe("readGreenhouse (Monzo's real board, saved 2026-11-16)", () => {
  const fetchFn = () => fakeFetch({ [BOARD]: "greenhouse-board.json", [JOBS]: "greenhouse-jobs.json" });

  it("returns the board's company name and every job", async () => {
    const board = await readGreenhouse("monzo", fetchFn());
    expect(board?.company_name).toBe("Monzo");
    expect(board?.jobs).toHaveLength(3);
  });

  it("maps each job's fields", async () => {
    const raw = fixtureJson("greenhouse-jobs.json").jobs[0];
    const [job] = (await readGreenhouse("monzo", fetchFn()))!.jobs;

    expect(job.external_id).toBe(String(raw.id));
    expect(job.title).toBe(raw.title.trim()); // real titles can have stray spaces ("Backend Engineer III ")
    expect(job.apply_url).toBe(raw.absolute_url);
    expect(job.locations).toEqual(["Cardiff, London or Remote (UK)"]);
    expect(job.countries).toEqual([]); // Greenhouse gives no country field
    expect(job.remote).toBeNull(); // nor a remote flag
    expect(job.posted_at).toEqual(new Date(raw.first_published));
  });

  it("un-escapes the description into real HTML and plain text", async () => {
    const [job] = (await readGreenhouse("monzo", fetchFn()))!.jobs;
    expect(job.description_html.startsWith("<div")).toBe(true);
    expect(job.description_html).not.toContain("&lt;");
    expect(job.description_text.length).toBeGreaterThan(200);
    expect(job.description_text).not.toMatch(/<[a-z]/i);
  });

  it("keeps non-UK jobs too (the UK check is a separate step)", async () => {
    const board = await readGreenhouse("monzo", fetchFn());
    expect(board!.jobs.map((j) => j.locations[0])).toEqual(["Cardiff, London or Remote (UK)", "London", "Barcelona"]);
  });

  it("returns null when the board doesn't exist", async () => {
    const fetch404 = fakeFetch({ "https://boards-api.greenhouse.io/v1/boards/nope": 404 });
    expect(await readGreenhouse("nope", fetch404)).toBeNull();
  });
});
