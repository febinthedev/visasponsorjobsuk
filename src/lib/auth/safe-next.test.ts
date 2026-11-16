import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/profile", "/profile"],
    ["/jobs?category=healthcare", "/jobs?category=healthcare"],
  ])("keeps on-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["account"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
  ])("falls back to / for unsafe or missing value %s", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
