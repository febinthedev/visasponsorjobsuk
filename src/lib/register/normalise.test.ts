import { describe, expect, it } from "vitest";
import { cleanText, normaliseName } from "./normalise";

describe("cleanText", () => {
  it("trims and collapses inner whitespace", () => {
    expect(cleanText("  London   Bridge  ")).toBe("London Bridge");
  });

  it("returns null for empty values", () => {
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("")).toBeNull();
  });
});

describe("normaliseName", () => {
  it.each([
    [" Asian African Foods Ltd ", "asian african foods"],
    ["ACME LIMITED", "acme"],
    ["Acme Ltd.", "acme"],
    ["Smith & Jones LLP", "smith and jones"],
    ["Smith and Jones", "smith and jones"],
    ["Barclays PLC", "barclays"],
    ["Big Issue Invest C.I.C.", "big issue invest"],
    ["Example (UK) Limited", "example uk"],
    ["O'Brien's Bakery Ltd", "obriens bakery"],
  ])("%j → %j", (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });

  it("keeps distinguishing words, so different companies stay different", () => {
    expect(normaliseName("Acme Solutions Ltd")).not.toBe(normaliseName("Acme Ltd"));
    expect(normaliseName("The Acme Company")).toBe("the acme company");
  });

  it("only strips a legal suffix at the end", () => {
    expect(normaliseName("Limited Edition Prints")).toBe("limited edition prints");
  });

  it("never returns an empty name", () => {
    expect(normaliseName("Ltd")).toBe("ltd");
    expect(normaliseName("北京餐厅")).toBe("北京餐厅");
  });

  it("drops accents instead of dropping the letter", () => {
    expect(normaliseName("Café Rouge Ltd")).toBe("cafe rouge");
  });
});
