import { describe, expect, it } from "vitest";
import { parseTypeRating, worstRating } from "./rating";

describe("parseTypeRating", () => {
  // Every wording in the 2026-11-12 register.
  it.each([
    ["Worker (A rating)", "worker", "a"],
    ["Worker (B rating)", "worker", "b"],
    ["Worker (A (Premium))", "worker", "a"],
    ["Worker (A (SME+))", "worker", "a"],
    ["Worker (UK Expansion Worker: Provisional )", "worker", "provisional"],
    ["Temporary Worker (A rating)", "temporary", "a"],
    ["Temporary Worker (B rating)", "temporary", "b"],
    ["Temporary Worker (A (Premium))", "temporary", "a"],
    ["Temporary Worker (A (SME+))", "temporary", "a"],
  ])("%j → %s licence, rating %s", (input, licence, rating) => {
    expect(parseTypeRating(input)).toEqual({ licence, rating });
  });

  it("treats wording it doesn't recognise as not rated (never as A)", () => {
    expect(parseTypeRating("Worker (Suspended)")).toEqual({ licence: "worker", rating: null });
    expect(parseTypeRating("Something new")).toEqual({ licence: null, rating: null });
  });
});

describe("worstRating", () => {
  it("keeps the most cautious rating when rows disagree", () => {
    expect(worstRating("a", "b")).toBe("b");
    expect(worstRating("provisional", "a")).toBe("provisional");
    expect(worstRating("b", "provisional")).toBe("b");
    expect(worstRating(undefined, "a")).toBe("a");
  });

  it("treats an unrecognised rating (null) as the most cautious", () => {
    expect(worstRating("a", null)).toBeNull();
    expect(worstRating(null, "a")).toBeNull();
  });
});
