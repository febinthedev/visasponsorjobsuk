import { describe, expect, it } from "vitest";
import { ukCheck } from "./location";

const text = (...locations: string[]) => ukCheck({ locations, countries: [] });

describe("ukCheck: location text only (e.g. Greenhouse)", () => {
  it.each([
    "London",
    "Manchester",
    "Edinburgh or Glasgow",
    "London, England",
    "London, United Kingdom - Deliveroo",
    "Cardiff, London or Remote (UK)",
    "London; Remote (UK)",
    "Remote (UK)",
    "UK Remote",
    "Remote - United Kingdom",
    "Hybrid - London",
    "Belfast",
    "Perth, Scotland",
    "Boston, Lincolnshire",
    "Melbourne, Derbyshire",
    "Richmond, London",
    "Cambridge",
    "Milton Keynes",
    "St. Albans",
  ])("%j is in the UK", (loc) => {
    expect(text(loc).uk).toBe(true);
  });

  it.each([
    "Barcelona",
    "Dubai, United Arab Emirates",
    "Paris, France",
    "Memphis, TN",
    "Dallas - Fort Worth, TX",
    "Cambridge, MA",
    "London, ON",
    "London, Ontario, Canada",
    "Birmingham, Alabama",
    "Manchester, New Hampshire",
    "Perth, WA",
    "Perth, Australia",
    "Boston, MA",
    "Richmond, VA",
    "New York, NY",
    "Singapore",
  ])("%j is abroad", (loc) => {
    expect(text(loc).uk).toBe(false);
  });

  it.each(["Remote", "EMEA", "Europe", "Melbourne", "Perth", "Washington", "Anywhere", ""])(
    "%j is unclear, so it isn't treated as UK",
    (loc) => {
      expect(text(loc).uk).toBe(false);
    },
  );

  it("keeps a job listed in several places if any is in the UK, and shows only the UK ones", () => {
    const r = text("New York, NY", "London, England");
    expect(r.uk).toBe(true);
    expect(r.ukLocations).toEqual(["London, England"]);
  });

  it("splits 'or' / ';' lists and keeps only the UK parts", () => {
    expect(text("London or Dublin, Ireland").ukLocations).toEqual(["London"]);
    expect(text("Cardiff, London or Remote (UK)").ukLocations).toEqual(["Cardiff, London", "Remote (UK)"]);
  });
});

describe("ukCheck: real strings from live Greenhouse boards (checked by hand, 2026-11-16)", () => {
  it("keeps only the UK parts of mixed lists", () => {
    expect(text("Barcelona; Cardiff, London or Remote (UK)").ukLocations).toEqual(["Cardiff, London", "Remote (UK)"]);
    expect(
      text(
        "Birmingham, United Kingdom; Bristol, United Kingdom; Dublin, Ireland; Edinburgh, United Kingdom; Leeds, United Kingdom; London, United Kingdom; Manchester, United Kingdom",
      ).ukLocations,
    ).not.toContain("Dublin, Ireland");
    expect(text("Dubai, United Arab Emirates; London, United Kingdom").ukLocations).toEqual(["London, United Kingdom"]);
  });

  it.each([
    "Washington (Remote)",
    "Remote - UNITED STATES ONLY",
    "US Remote",
    "Dallas, Denver",
    "Westminster, CO 80020",
    "Port Melbourne",
    "Sydney, Melbourne, Brisbane",
    "Greater Madrid Metropolitan Area",
    "Multiple Locations",
    "N/A",
    "Deliveroo",
  ])("doesn't treat %j as UK", (loc) => {
    expect(text(loc).uk).toBe(false);
  });

  it.each(["London Area, United Kingdom", "United Kingdom - Remote", "UK"])("treats %j as UK", (loc) => {
    expect(text(loc).uk).toBe(true);
  });
});

describe("ukCheck: with a country field (SmartRecruiters, Lever, Ashby, Workable)", () => {
  it.each([["gb"], ["GB"], ["United Kingdom"], ["UK"], ["England"]])("country %j is the UK", (country) => {
    expect(ukCheck({ locations: ["Brighton - St Josephs Business Park (Hop)"], countries: [country] }).uk).toBe(true);
  });

  it("trusts the country field over the place text", () => {
    expect(ukCheck({ locations: ["London"], countries: ["US"] }).uk).toBe(false);
    expect(ukCheck({ locations: ["Singapore, Singapore"], countries: ["SG"] }).uk).toBe(false);
  });

  it("with mixed countries, keeps the job and shows only the UK places", () => {
    const r = ukCheck({ locations: ["London, United Kingdom", "New York, NY"], countries: ["GB", "US"] });
    expect(r.uk).toBe(true);
    expect(r.ukLocations).toEqual(["London, United Kingdom"]);
  });

  it("keeps a UK job whose place text alone wouldn't be recognised", () => {
    const r = ukCheck({ locations: ["Glasgow - Scotland Street (Editions)"], countries: ["United Kingdom"] });
    expect(r).toEqual({ uk: true, ukLocations: ["Glasgow - Scotland Street (Editions)"], reason: "country field" });
  });
});

describe("ukCheck: reason", () => {
  it("says why a job was kept or dropped", () => {
    expect(text("London").reason).toBe("place name");
    expect(text("Remote").reason).toBe("unclear location");
    expect(text("Paris, France").reason).toBe("abroad");
  });
});
