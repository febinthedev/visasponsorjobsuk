// Board names from the Common Crawl web archive: every careers-page address the latest crawl saw on
// each hiring system's domain. Free and quick, but incomplete (it misses boards the crawl didn't
// visit), so it's a head start alongside name-guessing, not a replacement.
import { getJson, getText } from "@/lib/sources/http";

export type ArchiveSystem = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
type Phase1 = ArchiveSystem;

// Hosts whose first path segment is the board name.
const HOSTS: Record<Phase1, string[]> = {
  greenhouse: ["boards.greenhouse.io", "job-boards.greenhouse.io", "job-boards.eu.greenhouse.io", "boards.eu.greenhouse.io"],
  lever: ["jobs.lever.co", "jobs.eu.lever.co"],
  ashby: ["jobs.ashbyhq.com"],
  workable: ["apply.workable.com"],
  smartrecruiters: ["jobs.smartrecruiters.com", "careers.smartrecruiters.com"],
};
// First path segments that are part of the site, not a board name.
const NOT_BOARDS = new Set(["embed", "j", "api", "v1", "jobs", "careers", "static", "assets", "oneclick-ui"]);
const VALID_KEY = /^[a-z0-9][a-z0-9_-]*$/;

export const ARCHIVE_PATTERNS: Record<Phase1, string[]> = Object.fromEntries(
  Object.entries(HOSTS).map(([system, hosts]) => [system, hosts.map((h) => `${h}/*`)]),
) as Record<Phase1, string[]>;

export function boardKeyFromUrl(system: Phase1, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!HOSTS[system].includes(u.hostname)) return null;
  const segment = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  // Greenhouse's embeddable board: /embed/job_board?for=<board>
  if (system === "greenhouse" && segment === "embed") {
    const forKey = u.pathname.includes("job_board") ? u.searchParams.get("for")?.toLowerCase() : undefined;
    return forKey && VALID_KEY.test(forKey) ? forKey : null;
  }
  if (!segment || NOT_BOARDS.has(segment) || !VALID_KEY.test(segment)) return null;
  return segment;
}

const COLLINFO = "https://index.commoncrawl.org/collinfo.json";

// All board names the latest crawl has for one system. Pages are read one at a time (the index
// server is shared and slow); a single failed page is skipped, but if the archive can't be
// queried at all this throws, so a run never mistakes an outage for "no boards".
export async function archiveBoardKeys(system: Phase1, fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  const indexes = await getJson<{ "cdx-api": string }[]>(COLLINFO, fetchFn);
  const api = indexes?.[0]?.["cdx-api"];
  if (!api) throw new Error("Common Crawl index list unavailable");

  const keys = new Set<string>();
  for (const pattern of ARCHIVE_PATTERNS[system]) {
    const query = `${api}?url=${encodeURIComponent(pattern)}&output=json&fl=url`;
    // No page count means the archive couldn't be queried: fail, rather than report zero boards.
    const info = await getJson<{ pages: number }>(`${query}&showNumPages=true`, fetchFn);
    for (let page = 0; page < (info?.pages ?? 0); page++) {
      const body = await getText(`${query}&page=${page}`, fetchFn).catch(() => null);
      for (const line of body?.split("\n") ?? []) {
        try {
          const key = boardKeyFromUrl(system, (JSON.parse(line) as { url: string }).url);
          if (key) keys.add(key);
        } catch {
          // blank or partial line
        }
      }
    }
  }
  return keys;
}
