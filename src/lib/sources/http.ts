// Small HTTP helpers for reading public job boards.
// 404 → null (the board doesn't exist). Any other failure throws, so a broken or rate-limited
// board is never mistaken for a missing one.
export const USER_AGENT = "visasponsorjobsuk-jobs-reader";
const TIMEOUT_MS = 30_000;

async function get(url: string, fetchFn: typeof fetch): Promise<Response | null> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res;
}

export async function getJson<T = unknown>(url: string, fetchFn: typeof fetch = fetch): Promise<T | null> {
  const res = await get(url, fetchFn);
  return res ? ((await res.json()) as T) : null;
}

export async function getText(url: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const res = await get(url, fetchFn);
  return res ? res.text() : null;
}
