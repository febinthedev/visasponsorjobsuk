import { describe, expect, it } from "vitest";
import { normTitle, parseCodingIndex, parseFramework } from "./ons";

describe("normTitle", () => {
  it("lowercases, drops apostrophes and turns other punctuation into spaces", () => {
    expect(normTitle("  Chef’s Assistant ")).toBe("chefs assistant");
    expect(normTitle("Analyst-Programmer (IT)")).toBe("analyst programmer it");
    expect(normTitle("R&D  Manager")).toBe("r d manager");
  });
});

// Same column names as the real "SOC2020 coding index" sheet (2026-08-27 v3), other columns trimmed.
const HEAD = ["UNIQUE ID", "SOC_2020", "INDEXOCC", "ADD", "IND", "INDEXOCC_-_natural_word_order"];
describe("parseCodingIndex", () => {
  it("returns each title → code pair once, keeping titles that map to several codes", () => {
    const { titles, skipped } = parseCodingIndex([
      HEAD,
      ["a1", "2421", "Accountant", "qualified", "", "Accountant"],
      ["a2", "2421", "Accountant", "qualified, management accountancy", "", "Accountant"],
      ["a3", "4122", "Accountant", "", "", "Accountant"],
      ["a4", "2134", "Developer, software", "", "", "Software developer"],
      ["a5", "}}}}", "Lord", "", "", "Lord"], // not classifiable: no code
    ]);
    expect(titles).toEqual([
      { title_normalised: "accountant", soc_code: "2421" },
      { title_normalised: "accountant", soc_code: "4122" },
      { title_normalised: "software developer", soc_code: "2134" },
    ]);
    expect(skipped).toBe(1);
  });

  it("fails loudly if the expected columns are missing", () => {
    expect(() => parseCodingIndex([["UNIQUE ID", "SOC2020"]])).toThrow(/SOC_2020/);
  });
});

describe("parseFramework", () => {
  it("returns the 4-digit unit groups with their titles", () => {
    const rows = [
      ["Unique ID", "SOC2020 Major Group", "SOC2020 Sub-Major Group", "SOC2020 Minor Group", "SOC2020 Unit Group", "SOC2020 Group Title", "Change", "VERNO"],
      ["", "1", "", "", "", "MANAGERS, DIRECTORS AND SENIOR OFFICIALS"],
      [],
      ["", "", "", "111", "", "Chief Executives and Senior Officials"],
      ["soc-y1aa", "", "", "", "1111", "Chief executives and senior officials"],
    ];
    expect(parseFramework(rows)).toEqual([{ soc_code: "1111", title: "Chief executives and senior officials" }]);
  });
});
