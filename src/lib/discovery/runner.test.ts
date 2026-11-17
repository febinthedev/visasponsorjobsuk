import { describe, expect, it } from "vitest";
import { runQueues } from "./runner";

describe("runQueues", () => {
  it("works through each system's queue in order, all systems side by side", async () => {
    const seen: string[] = [];
    const summary = await runQueues(
      { greenhouse: ["a", "b"], lever: ["c"] },
      async (system, item) => {
        seen.push(`${system}:${item}`);
        return { error: false };
      },
      { intervalMs: 0, maxConsecutiveErrors: 3 },
    );
    expect(seen.filter((s) => s.startsWith("greenhouse"))).toEqual(["greenhouse:a", "greenhouse:b"]);
    expect(seen).toContain("lever:c");
    expect(summary).toEqual({
      greenhouse: { done: 2, errors: 0, stopped: null },
      lever: { done: 1, errors: 0, stopped: null },
    });
  });

  it("stops a system after too many errors in a row, without stopping the others", async () => {
    const summary = await runQueues(
      { ashby: ["1", "2", "3", "4", "5"], workable: ["x", "y"] },
      async (system) => ({ error: system === "ashby" }),
      { intervalMs: 0, maxConsecutiveErrors: 3 },
    );
    expect(summary.ashby).toEqual({ done: 3, errors: 3, stopped: "3 errors in a row" });
    expect(summary.workable).toEqual({ done: 2, errors: 0, stopped: null });
  });

  it("resets the error streak after a success", async () => {
    const results = [true, true, false, true, true, false];
    let i = 0;
    const summary = await runQueues(
      { lever: ["1", "2", "3", "4", "5", "6"] },
      async () => ({ error: results[i++] }),
      { intervalMs: 0, maxConsecutiveErrors: 3 },
    );
    expect(summary.lever).toEqual({ done: 6, errors: 4, stopped: null });
  });

  it("stops taking new work after the time limit", async () => {
    const summary = await runQueues(
      { greenhouse: ["1", "2", "3"] },
      async () => ({ error: false }),
      { intervalMs: 0, maxConsecutiveErrors: 3, deadline: Date.now() - 1 },
    );
    expect(summary.greenhouse).toEqual({ done: 0, errors: 0, stopped: "time limit" });
  });

  it("runs several checks at once per system when allowed, so slow answers don't hold up the queue", async () => {
    const started = Date.now();
    let inFlight = 0;
    let maxInFlight = 0;
    const summary = await runQueues(
      { greenhouse: ["1", "2", "3", "4", "5", "6"] },
      async () => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await new Promise((r) => setTimeout(r, 60));
        inFlight--;
        return { error: false };
      },
      { intervalMs: 0, maxConsecutiveErrors: 3, concurrency: 3 },
    );
    expect(summary.greenhouse.done).toBe(6);
    expect(maxInFlight).toBe(3);
    expect(Date.now() - started).toBeLessThan(250); // ~2 rounds of 60ms, not 6
  });

  it("keeps the start rate limit even with several checks at once", async () => {
    const starts: number[] = [];
    await runQueues(
      { greenhouse: ["1", "2", "3", "4"] },
      async () => {
        starts.push(Date.now());
        return { error: false };
      },
      { intervalMs: 40, maxConsecutiveErrors: 3, concurrency: 4 },
    );
    expect(starts[3] - starts[0]).toBeGreaterThanOrEqual(110); // 3 gaps of ~40ms
  });

  it("lets one system run at its own slower pace (Workable rate-limits hard)", async () => {
    const starts: Record<string, number[]> = { workable: [], greenhouse: [] };
    await runQueues(
      { workable: ["1", "2"], greenhouse: ["1", "2", "3"] },
      async (system) => {
        starts[system].push(Date.now());
        return { error: false };
      },
      { intervalMs: 0, maxConsecutiveErrors: 3, concurrency: 3, perSystem: { workable: { intervalMs: 80, concurrency: 1 } } },
    );
    expect(starts.workable[1] - starts.workable[0]).toBeGreaterThanOrEqual(75);
    expect(starts.greenhouse[2] - starts.greenhouse[0]).toBeLessThan(40);
  });

  it("waits between requests to the same system", async () => {
    const started = Date.now();
    await runQueues({ greenhouse: ["1", "2", "3"] }, async () => ({ error: false }), {
      intervalMs: 40,
      maxConsecutiveErrors: 3,
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(75); // two pauses between three requests
  });
});
