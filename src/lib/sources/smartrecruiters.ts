// SmartRecruiters public Posting API: https://developers.smartrecruiters.com/docs/posting-api
// The list gives each posting's country but no description, so details are fetched only for UK
// postings (country "gb"): saves hundreds of requests on big international boards (Wise: 438).
// The API answers 200 even for names that don't exist, so "no postings" is treated as no board.
import { htmlToText } from "./html";
import { getJson } from "./http";
import type { BoardJob, BoardReader } from "./types";

const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE = 100;

type Location = { fullLocation?: string; country?: string; remote?: boolean };
type ListItem = { id: string; name: string; releasedDate?: string; company?: { name?: string }; location?: Location };
type List = { totalFound: number; content: ListItem[] };
type Section = { title?: string; text?: string };
type Detail = {
  id: string;
  name: string;
  postingUrl?: string; // absent in summary mode (list items only)
  releasedDate?: string;
  location?: Location;
  jobAd?: { sections?: Record<string, Section> };
};

const SECTION_ORDER = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"];
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toJob(d: Detail): BoardJob {
  const sections = d.jobAd?.sections ?? {};
  const html = SECTION_ORDER.map((key) => sections[key])
    .filter((s): s is Section => !!s?.text)
    .map((s) => (s.title ? `<h3>${escapeHtml(s.title)}</h3>` : "") + s.text)
    .join("\n");
  const place = d.location?.fullLocation?.split(",").map((p) => p.trim()).filter(Boolean).join(", ");
  return {
    external_id: String(d.id),
    title: d.name.trim(),
    description_html: html,
    description_text: htmlToText(html),
    apply_url: d.postingUrl ?? "",
    locations: place ? [place] : [],
    countries: d.location?.country ? [d.location.country] : [],
    remote: d.location?.remote ?? null,
    posted_at: d.releasedDate ? new Date(d.releasedDate) : null,
  };
}

export const readSmartRecruiters: BoardReader = async (boardKey, fetchFn = fetch, opts = {}) => {
  const base = `${API}/${encodeURIComponent(boardKey)}/postings`;

  const items: ListItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await getJson<List>(`${base}?limit=${PAGE}&offset=${offset}`, fetchFn);
    if (!page) return null;
    items.push(...page.content);
    if (page.content.length === 0 || offset + PAGE >= page.totalFound) break;
  }
  if (items.length === 0) return null;

  const ukItems = items.filter((i) => i.location?.country?.toLowerCase() === "gb");
  const company_name = items[0].company?.name?.trim() || null;
  // Summary (discovery): the list already has titles and places, so no detail requests.
  if (opts.summary) return { company_name, jobs: ukItems.map((i) => toJob(i)) };

  const jobs: BoardJob[] = [];
  for (const item of ukItems) {
    const detail = await getJson<Detail>(`${base}/${encodeURIComponent(item.id)}`, fetchFn);
    if (detail) jobs.push(toJob(detail));
  }
  return { company_name, jobs };
};
