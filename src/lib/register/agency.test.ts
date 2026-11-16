import { describe, expect, it } from "vitest";
import { agencyReason } from "./agency";

describe("agencyReason", () => {
  it.each([
    ["KMG Recruitment Ltd", 'name contains "recruitment"'],
    ["Recruit Workforce Ltd", 'name contains "recruit"'],
    ["Blossom Staffing Ltd", 'name contains "staffing"'],
    ["MJK Resourcing Ltd", 'name contains "resourcing"'],
    ["NATIONWIDE LOCUMS LTD", 'name contains "locums"'],
    ["JS Locum Services Ltd", 'name contains "locum"'],
    ["HEADHUNTING EXPERTS MANAGEMENT LTD", 'name contains "headhunting"'],
  ])("flags %j", (name, reason) => {
    expect(agencyReason(name)).toBe(reason);
  });

  it.each([
    "Homes and Communities Agency",
    "PERSONNEL HYGIENE SERVICES LIMITED",
    "Loch Employment Law Limited",
    "Kaizen Search Marketing LTD",
    "Talent Technology Limited",
    "Sunrise Home Care Agency Ltd",
    "Barclays Bank PLC",
  ])("does not flag genuine employer %j", (name) => {
    expect(agencyReason(name)).toBeNull();
  });

  it("matches whole words only", () => {
    expect(agencyReason("Restaffingham Farms Ltd")).toBeNull();
  });
});
