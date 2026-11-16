import { describe, expect, it } from "vitest";
import { groupRegister, sponsorKey } from "./group";

const HEADER = ["Organisation Name", "Town/City", "County", "Type & Rating", "Route"];

describe("groupRegister", () => {
  it("merges one employer's rows (one per route) into a single sponsor", () => {
    const sponsors = groupRegister([
      HEADER,
      [" Acme Ltd ", " London  ", "", "Worker (A rating)", "Skilled Worker"],
      ["ACME LIMITED", "london", "Greater London", "Worker (A rating)", "Global Business Mobility: Senior or Specialist Worker"],
      ["Acme Ltd", "London", "", "Worker (A rating)", "Skilled Worker"],
    ]);
    expect(sponsors).toHaveLength(1);
    expect(sponsors[0]).toEqual({
      name: "Acme Ltd",
      name_normalised: "acme",
      town: "London",
      county: "Greater London",
      routes: ["Global Business Mobility: Senior or Specialist Worker", "Skilled Worker"],
      rating: "a",
      is_agency: false,
      agency_reason: null,
    });
  });

  it("keeps the same name in different towns as different employers", () => {
    const sponsors = groupRegister([
      HEADER,
      ["Acme Ltd", "London", "", "Worker (A rating)", "Skilled Worker"],
      ["Acme Ltd", "Leeds", "", "Worker (A rating)", "Skilled Worker"],
    ]);
    expect(sponsors.map((s) => s.town).sort()).toEqual(["Leeds", "London"]);
  });

  it("cleans trailing spaces in route names", () => {
    const [s] = groupRegister([HEADER, ["Charity X", "Bath", "", "Worker (A rating)", "Charity Worker "]]);
    expect(s.routes).toEqual(["Charity Worker"]);
  });

  it("flags agencies with a reason", () => {
    const [s] = groupRegister([HEADER, ["KMG Recruitment Ltd", "Hull", "", "Worker (A rating)", "Skilled Worker"]]);
    expect(s.is_agency).toBe(true);
    expect(s.agency_reason).toBe('name contains "recruitment"');
  });

  it("stores a blank town as null and skips rows with no name", () => {
    const sponsors = groupRegister([
      HEADER,
      ["Acme Ltd", "  ", "", "Worker (A rating)", "Skilled Worker"],
      ["   ", "London", "", "Worker (A rating)", "Skilled Worker"],
    ]);
    expect(sponsors).toHaveLength(1);
    expect(sponsors[0].town).toBeNull();
  });

  it("rates the Worker licence, keeping the most cautious rating across rows", () => {
    const [s] = groupRegister([
      HEADER,
      ["Acme Ltd", "York", "", "Worker (A rating)", "Skilled Worker"],
      ["Acme Ltd", "York", "", "Worker (B rating)", "Global Business Mobility: Graduate Trainee"],
    ]);
    expect(s.rating).toBe("b");
  });

  it("ignores the Temporary Worker licence's rating", () => {
    const [s] = groupRegister([
      HEADER,
      ["Acme Ltd", "York", "", "Worker (A rating)", "Skilled Worker"],
      ["Acme Ltd", "York", "", "Temporary Worker (B rating)", "Creative Worker"],
    ]);
    expect(s.rating).toBe("a");
  });

  it("leaves the rating empty for employers with only a Temporary Worker licence", () => {
    const [s] = groupRegister([HEADER, ["Theatre Co", "Bath", "", "Temporary Worker (A rating)", "Creative Worker"]]);
    expect(s.rating).toBeNull();
  });

  it("refuses a file whose columns have changed", () => {
    expect(() => groupRegister([["Name", "Town", "Route"], ["Acme", "London", "Skilled Worker"]])).toThrow(
      /unexpected columns/i,
    );
  });
});

describe("sponsorKey", () => {
  it("ignores case in the town", () => {
    expect(sponsorKey("acme", "LONDON")).toBe(sponsorKey("acme", "London"));
    expect(sponsorKey("acme", null)).not.toBe(sponsorKey("acme", "London"));
  });
});
