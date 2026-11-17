import { describe, expect, it } from "vitest";
import { candidateKeys } from "./candidates";

describe("candidateKeys", () => {
  it("joins the name with and without hyphens", () => {
    expect(candidateKeys("asian african foods")).toEqual(["asianafricanfoods", "asian-african-foods"]);
  });

  it("also tries the name without generic trailing words", () => {
    expect(candidateKeys("monzo bank")).toEqual(["monzobank", "monzo-bank", "monzo"]);
    expect(candidateKeys("palantir technologies uk")).toEqual([
      "palantirtechnologiesuk",
      "palantir-technologies-uk",
      "palantir",
    ]);
    expect(candidateKeys("deliveroo uk group holdings")).toEqual([
      "deliverooukgroupholdings",
      "deliveroo-uk-group-holdings",
      "deliveroo",
    ]);
  });

  it("gives a single-word name once", () => {
    expect(candidateKeys("1000heads")).toEqual(["1000heads"]);
  });

  it("never reduces a name to nothing", () => {
    expect(candidateKeys("global services")).toEqual(["globalservices", "global-services", "global"]);
    expect(candidateKeys("uk group")).toEqual(["ukgroup", "uk-group"]);
  });

  it("skips names that can't be a board name (too short, or no Latin letters)", () => {
    expect(candidateKeys("ab")).toEqual([]);
    expect(candidateKeys("北京餐厅")).toEqual([]);
  });
});
