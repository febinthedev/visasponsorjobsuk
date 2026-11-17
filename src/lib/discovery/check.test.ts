import { describe, expect, it, vi } from "vitest";
import type { Board, BoardJob, BoardReader } from "@/lib/sources/types";
import { checkBoard } from "./check";
import { buildSponsorIndex } from "./match";

const index = buildSponsorIndex([
  { id: 1, name_normalised: "monzo bank" },
  { id: 2, name_normalised: "global logistics" },
  { id: 3, name_normalised: "global payments" },
]);
const job = (locations: string[], countries: string[] = []): BoardJob => ({
  external_id: "1",
  title: "Engineer",
  description_html: "",
  description_text: "",
  apply_url: "",
  locations,
  countries,
  remote: null,
  posted_at: null,
});
const reader = (board: Board | null | Error): BoardReader =>
  vi.fn(async () => {
    if (board instanceof Error) throw board;
    return board;
  });

describe("checkBoard", () => {
  it("matches a board whose name fits one employer and which has UK jobs", async () => {
    const r = reader({ company_name: "Monzo", jobs: [job(["London"]), job(["Barcelona"])] });
    expect(await checkBoard("greenhouse", "monzo", r, index)).toEqual({
      system: "greenhouse",
      board_key: "monzo",
      result: "matched",
      company_name: "Monzo",
      sponsor_id: 1,
      jobs: 2,
      uk_jobs: 1,
    });
  });

  it("asks the reader for a summary only (no descriptions needed)", async () => {
    const r = reader({ company_name: "Monzo", jobs: [] });
    await checkBoard("smartrecruiters", "monzo", r, index);
    expect(r).toHaveBeenCalledWith("monzo", undefined, { summary: true });
  });

  it("records a board that fits but has no UK jobs", async () => {
    const r = reader({ company_name: "Monzo", jobs: [job(["Dubai, United Arab Emirates"])] });
    expect((await checkBoard("lever", "monzo", r, index)).result).toBe("no_uk_jobs");
  });

  it.each([
    [null, "not_found"],
    [{ company_name: null, jobs: [job(["London"])] }, "no_name"],
    [{ company_name: "Wise Worksite Field Sales", jobs: [job(["London"])] }, "no_match"],
    [{ company_name: "Global", jobs: [job(["London"])] }, "ambiguous"],
  ] as const)("board %j → %s", async (board, result) => {
    const outcome = await checkBoard("greenhouse", "x", reader(board as Board | null), index);
    expect(outcome.result).toBe(result);
    expect(outcome.sponsor_id).toBeUndefined();
  });

  it("records a failed read as an error with its message, instead of stopping the run", async () => {
    const outcome = await checkBoard("ashby", "x", reader(new Error("GET … failed: 429")), index);
    expect(outcome).toMatchObject({ result: "error", error: "GET … failed: 429" });
  });
});
