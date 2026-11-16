import { describe, expect, it, vi } from "vitest";
import { getJson, getText, USER_AGENT } from "./http";

const respond = (status: number, body: string) =>
  vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe("getJson / getText", () => {
  it("returns the parsed body on success", async () => {
    expect(await getJson("https://x.test/a", respond(200, '{"ok":true}'))).toEqual({ ok: true });
    expect(await getText("https://x.test/a", respond(200, "<title>Hi</title>"))).toBe("<title>Hi</title>");
  });

  it("returns null for 404 (the board doesn't exist)", async () => {
    expect(await getJson("https://x.test/missing", respond(404, "Not found"))).toBeNull();
    expect(await getText("https://x.test/missing", respond(404, "Not found"))).toBeNull();
  });

  it("throws for other failures, so a broken board isn't mistaken for a missing one", async () => {
    await expect(getJson("https://x.test/a", respond(500, "oops"))).rejects.toThrow(/500/);
    await expect(getJson("https://x.test/a", respond(429, "slow down"))).rejects.toThrow(/429/);
  });

  it("identifies itself with a generic user agent", async () => {
    const fetchFn = respond(200, "{}");
    await getJson("https://x.test/a", fetchFn);
    const init = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("User-Agent")).toBe(USER_AGENT);
    expect(USER_AGENT).not.toMatch(/@/);
  });
});
