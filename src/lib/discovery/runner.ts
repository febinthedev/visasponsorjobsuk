// Runs one queue per hiring system, all systems side by side. Within a system, checks start at most
// once every intervalMs (polite to each API), with up to `concurrency` in flight so slow answers
// don't hold up the queue. A system stops after too many errors in a row (usually rate limiting);
// everything stops taking new work at the deadline. A check that hasn't settled after itemTimeoutMs
// counts as an error and the worker moves on, so one hung request can't stall the run.
export type QueueSummary = { done: number; errors: number; stopped: string | null };

function withTimeout(p: Promise<{ error: boolean }>, ms?: number): Promise<{ error: boolean }> {
  if (ms === undefined) return p;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ error: boolean }>((resolve) => (timer = setTimeout(() => resolve({ error: true }), ms)));
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function runQueues<T>(
  queues: Record<string, T[]>,
  work: (system: string, item: T) => Promise<{ error: boolean }>,
  opts: {
    intervalMs: number;
    maxConsecutiveErrors: number;
    concurrency?: number;
    deadline?: number;
    itemTimeoutMs?: number;
    perSystem?: Record<string, { intervalMs?: number; concurrency?: number }>; // overrides per system
  },
): Promise<Record<string, QueueSummary>> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const runOne = async (system: string, items: T[]): Promise<QueueSummary> => {
    const intervalMs = opts.perSystem?.[system]?.intervalMs ?? opts.intervalMs;
    const concurrency = Math.max(1, opts.perSystem?.[system]?.concurrency ?? opts.concurrency ?? 1);
    const s: QueueSummary = { done: 0, errors: 0, stopped: null };
    let next = 0; // next item to take
    let nextStart = 0; // earliest time the next check may start
    let streak = 0;

    const worker = async () => {
      while (next < items.length && !s.stopped) {
        if (opts.deadline !== undefined && Date.now() >= opts.deadline) {
          s.stopped = "time limit";
          return;
        }
        const item = items[next++];
        // Reserve a start slot, then wait for it: keeps starts ≥ intervalMs apart across workers.
        const slot = Math.max(Date.now(), nextStart);
        nextStart = slot + intervalMs;
        if (slot > Date.now()) await sleep(slot - Date.now());

        const { error } = await withTimeout(work(system, item), opts.itemTimeoutMs);
        s.done++;
        if (error) {
          s.errors++;
          if (++streak >= opts.maxConsecutiveErrors && !s.stopped) s.stopped = `${streak} errors in a row`;
        } else {
          streak = 0;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return s;
  };

  const entries = await Promise.all(Object.entries(queues).map(async ([sys, items]) => [sys, await runOne(sys, items)] as const));
  return Object.fromEntries(entries);
}
