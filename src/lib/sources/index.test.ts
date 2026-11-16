import { describe, expect, it } from "vitest";
import { SOURCE_SYSTEMS } from "@/db/schema";
import { READERS } from "./index";

describe("READERS", () => {
  it("has a reader for each Phase 1 hiring system", () => {
    expect(Object.keys(READERS).sort()).toEqual(["ashby", "greenhouse", "lever", "smartrecruiters", "workable"]);
  });

  it("only uses system names the database accepts", () => {
    for (const system of Object.keys(READERS)) expect(SOURCE_SYSTEMS).toContain(system);
  });
});
