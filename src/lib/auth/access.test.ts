import { describe, expect, it } from "vitest";
import { accessFor, decide } from "./access";

describe("accessFor", () => {
  it.each(["/", "/jobs", "/jobs/123", "/auth/login", "/auth/callback", "/profiles-of-employers", "/administrator"])(
    "%s is public",
    (path) => expect(accessFor(path)).toBe("public"),
  );

  it.each(["/profile", "/profile/edit"])("%s needs a signed-in user", (path) => {
    expect(accessFor(path)).toBe("user");
  });

  it.each(["/admin", "/admin/sponsors"])("%s is admin only", (path) => {
    expect(accessFor(path)).toBe("admin");
  });
});

describe("decide", () => {
  it("lets anyone into public pages", () => {
    expect(decide("public", { signedIn: false, isAdmin: false })).toBe("allow");
  });

  it("sends signed-out visitors on user pages to login", () => {
    expect(decide("user", { signedIn: false, isAdmin: false })).toBe("login");
    expect(decide("user", { signedIn: true, isAdmin: false })).toBe("allow");
  });

  it("only lets admins into admin pages", () => {
    expect(decide("admin", { signedIn: false, isAdmin: false })).toBe("login");
    expect(decide("admin", { signedIn: true, isAdmin: false })).toBe("deny");
    expect(decide("admin", { signedIn: true, isAdmin: true })).toBe("allow");
  });
});
