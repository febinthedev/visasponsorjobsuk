import { describe, expect, it } from "vitest";
import type { RegisterSponsor } from "./group";
import { checkSafety, planSync, type ExistingSponsor } from "./sync";

const incoming = (name_normalised: string, town: string | null, extra: Partial<RegisterSponsor> = {}): RegisterSponsor => ({
  name: name_normalised,
  name_normalised,
  town,
  county: null,
  routes: ["Skilled Worker"],
  rating: "a",
  is_agency: false,
  agency_reason: null,
  ...extra,
});
const existing = (id: number, name_normalised: string, town: string | null, removed = false): ExistingSponsor => ({
  id,
  name_normalised,
  town,
  removed_at: removed ? new Date("2026-01-01") : null,
});

describe("planSync", () => {
  it("inserts employers that are new to the database", () => {
    const plan = planSync([], [incoming("acme", "London")]);
    expect(plan.inserts.map((s) => s.name_normalised)).toEqual(["acme"]);
    expect(plan.updates).toEqual([]);
    expect(plan.removeIds).toEqual([]);
  });

  it("updates employers still on the register, matching town case-insensitively", () => {
    const plan = planSync([existing(7, "acme", "LONDON")], [incoming("acme", "London", { routes: ["A", "B"] })]);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([{ id: 7, ...incoming("acme", "London", { routes: ["A", "B"] }) }]);
    expect(plan.reactivated).toBe(0);
  });

  it("marks live employers missing from the register for removal", () => {
    const plan = planSync([existing(1, "acme", "London"), existing(2, "gone", "Leeds")], [incoming("acme", "London")]);
    expect(plan.removeIds).toEqual([2]);
  });

  it("doesn't re-remove employers that were already removed", () => {
    const plan = planSync([existing(3, "old", "Bath", true)], []);
    expect(plan.removeIds).toEqual([]);
  });

  it("brings back employers who return to the register", () => {
    const plan = planSync([existing(4, "back", "York", true)], [incoming("back", "York")]);
    expect(plan.updates.map((u) => u.id)).toEqual([4]);
    expect(plan.reactivated).toBe(1);
  });

  it("counts live employers before the sync", () => {
    expect(planSync([existing(1, "a", null), existing(2, "b", null, true)], []).liveBefore).toBe(1);
  });
});

describe("checkSafety", () => {
  const plan = (sponsors: number, removals: number, liveBefore: number) => ({
    incomingCount: sponsors,
    removeCount: removals,
    liveBefore,
  });

  it("accepts a normal daily change", () => {
    expect(checkSafety(plan(127_000, 300, 127_000))).toBeNull();
  });

  it("accepts the very first sync into an empty table", () => {
    expect(checkSafety(plan(127_000, 0, 0))).toBeNull();
  });

  it("refuses a register that looks incomplete", () => {
    expect(checkSafety(plan(12_000, 0, 0))).toMatch(/only 12000 employers/i);
  });

  it("refuses to remove more than 5% of live employers at once", () => {
    expect(checkSafety(plan(120_000, 7_000, 127_000))).toMatch(/would remove 7000/i);
  });
});
