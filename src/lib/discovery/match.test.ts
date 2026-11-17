import { describe, expect, it } from "vitest";
import { buildSponsorIndex, matchBoard } from "./match";

// Live, non-agency employers as stored (name_normalised from the register).
const index = buildSponsorIndex([
  { id: 1, name_normalised: "monzo bank" },
  { id: 2, name_normalised: "wise payments" },
  { id: 3, name_normalised: "palantir technologies uk" },
  { id: 4, name_normalised: "global logistics" },
  { id: 5, name_normalised: "global payments" },
  { id: 6, name_normalised: "acme" },
  { id: 7, name_normalised: "acme solutions" },
  { id: 8, name_normalised: "deliveroo" },
  { id: 9, name_normalised: "deliveroo" }, // same name, two towns
]);

describe("matchBoard", () => {
  it("matches a brand that is the start of exactly one employer's name", () => {
    expect(matchBoard("Monzo", index)).toEqual({ result: "matched", sponsorId: 1 });
    expect(matchBoard("Palantir Technologies", index)).toEqual({ result: "matched", sponsorId: 3 });
  });

  it("matches whole words only", () => {
    expect(matchBoard("Mon", index)).toEqual({ result: "no_match" });
    expect(matchBoard("Monzo Bankers", index)).toEqual({ result: "no_match" });
  });

  it("rejects a board whose name fits no employer (Greenhouse 'wise' is a US firm)", () => {
    expect(matchBoard("Wise Worksite Field Sales", index)).toEqual({ result: "no_match" });
  });

  it("skips a name that fits several employers rather than guessing", () => {
    expect(matchBoard("Global", index)).toEqual({ result: "ambiguous" });
  });

  it("treats an exact name as ambiguous if longer names also start with it (real case: 'Wise' vs 'WISE')", () => {
    // In the real register "wise" is a different organisation from "wise payments"; picking the
    // exact name would have put Wise's 209 jobs under the wrong employer.
    expect(matchBoard("Acme Ltd", index)).toEqual({ result: "ambiguous" });
    expect(matchBoard("Wise", index)).toEqual({ result: "matched", sponsorId: 2 }); // only "wise payments" in this index
  });

  it("treats two employers with exactly the same name as ambiguous", () => {
    expect(matchBoard("Deliveroo", index)).toEqual({ result: "ambiguous" });
  });

  it("ignores 'Careers' / 'Jobs' added to a board's name", () => {
    expect(matchBoard("Monzo Careers", index)).toEqual({ result: "matched", sponsorId: 1 });
    expect(matchBoard("Monzo Jobs", index)).toEqual({ result: "matched", sponsorId: 1 });
  });

  it("can't match a board with no name", () => {
    expect(matchBoard(null, index)).toEqual({ result: "no_name" });
    expect(matchBoard("  ", index)).toEqual({ result: "no_name" });
  });
});
