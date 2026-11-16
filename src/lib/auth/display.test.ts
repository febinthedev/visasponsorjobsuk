import { describe, expect, it } from "vitest";
import { initials, signInHref } from "./display";

describe("initials", () => {
  it.each([
    ["Febin Felix", null, "FF"],
    ["Ada", null, "A"],
    ["  mary  jane  watson ", null, "MW"],
    [null, "zoe@example.com", "Z"],
    [null, null, "?"],
    ["", "", "?"],
  ])("name %j, email %j → %s", (name, email, expected) => {
    expect(initials(name, email)).toBe(expected);
  });
});

describe("signInHref", () => {
  it("returns to the current page after sign-in", () => {
    expect(signInHref("/profile")).toBe("/auth/login?next=%2Fprofile");
    expect(signInHref("/jobs/42")).toBe("/auth/login?next=%2Fjobs%2F42");
  });

  it("doesn't loop back into the sign-in pages", () => {
    expect(signInHref("/auth/login")).toBe("/auth/login");
    expect(signInHref("/auth/callback")).toBe("/auth/login");
  });

  it("uses a plain link from the home page", () => {
    expect(signInHref("/")).toBe("/auth/login");
  });
});
