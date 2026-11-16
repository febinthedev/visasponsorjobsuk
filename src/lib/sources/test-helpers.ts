// Test-only: a fake fetch that serves saved real responses from ./fixtures instead of the network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

export const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
export const fixtureJson = <T = any>(name: string): T => JSON.parse(fixture(name)); // eslint-disable-line @typescript-eslint/no-explicit-any

// routes: URL → fixture file name (or a status code to return instead). Unknown URLs fail the test.
export function fakeFetch(routes: Record<string, string | number>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    if (route === undefined) throw new Error(`Unexpected request in test: ${url}`);
    if (typeof route === "number") return new Response("", { status: route });
    return new Response(fixture(route), { status: 200 });
  }) as unknown as typeof fetch;
}
