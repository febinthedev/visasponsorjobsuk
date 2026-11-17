import { describe, expect, it } from "vitest";
import type { BoardJob } from "@/lib/sources/types";
import { planBoard, ukJobRows, type ExistingJob } from "./plan";

const job = (id: string, extra: Partial<BoardJob> = {}): BoardJob => ({
  external_id: id,
  title: `Engineer ${id}`,
  description_html: "<p>Build things</p>",
  description_text: "Build things",
  apply_url: `https://example.com/jobs/${id}`,
  locations: ["London, UK"],
  countries: [],
  remote: null,
  posted_at: new Date("2026-11-01T00:00:00Z"),
  ...extra,
});

describe("ukJobRows", () => {
  it("keeps only UK jobs, showing only their UK places", () => {
    const { rows, dropped } = ukJobRows([
      job("1", { locations: ["London, UK", "New York, NY"] }),
      job("2", { locations: ["Berlin, Germany"] }),
      job("3", { locations: ["Remote"] }), // unclear never counts as UK
    ]);
    expect(rows.map((r) => r.external_id)).toEqual(["1"]);
    expect(rows[0].locations).toEqual(["London, UK"]);
    expect(dropped).toBe(2);
  });

  it("stores the remote flag as true/false (unknown = false)", () => {
    const { rows } = ukJobRows([job("1", { remote: true }), job("2", { remote: null })]);
    expect(rows.map((r) => r.is_remote)).toEqual([true, false]);
  });

  it("gives the same fingerprint for the same ad, and a new one when the ad is edited", () => {
    const [a] = ukJobRows([job("1")]).rows;
    const [b] = ukJobRows([job("1")]).rows;
    const [c] = ukJobRows([job("1", { description_html: "<p>Build other things</p>" })]).rows;
    expect(a.content_hash).toBe(b.content_hash);
    expect(c.content_hash).not.toBe(a.content_hash);
  });

  it("keeps the first copy when a board lists the same job twice", () => {
    const { rows } = ukJobRows([job("1"), job("1", { title: "Duplicate" })]);
    expect(rows.map((r) => r.title)).toEqual(["Engineer 1"]);
  });
});

describe("planBoard", () => {
  const rows = (...jobs: BoardJob[]) => ukJobRows(jobs).rows;
  const hashOf = (j: BoardJob) => rows(j)[0].content_hash;
  const existing = (id: number, external_id: string, content_hash: string, closed_at: Date | null = null): ExistingJob => ({
    id,
    external_id,
    content_hash,
    closed_at,
  });

  it("adds new jobs, updates edited ones, marks unchanged ones as seen and closes missing ones", () => {
    const plan = planBoard(
      [
        existing(10, "same", hashOf(job("same"))),
        existing(11, "edited", "old-hash"),
        existing(12, "gone", "h"),
      ],
      rows(job("same"), job("edited"), job("new")),
    );
    expect(plan.insert.map((r) => r.external_id)).toEqual(["new"]);
    expect(plan.update.map((r) => [r.id, r.external_id])).toEqual([[11, "edited"]]);
    expect(plan.seenIds).toEqual([10]);
    expect(plan.closeIds).toEqual([12]);
  });

  it("reopens a closed job that comes back, and doesn't close an already closed one again", () => {
    const closed = new Date("2026-11-10");
    const plan = planBoard(
      [existing(20, "back", hashOf(job("back")), closed), existing(21, "still-gone", "h", closed)],
      rows(job("back")),
    );
    expect(plan.seenIds).toEqual([20]); // seen again: closed_at is cleared
    expect(plan.closeIds).toEqual([]);
  });
});
