// Ashby public Job Postings API: https://developers.ashbyhq.com/docs/public-job-posting-api
// The API gives no company name, so it comes from the board page's <title> ("Deliveroo Jobs").
import { htmlToText, pageTitle } from "./html";
import { getJson, getText } from "./http";
import type { BoardJob, BoardReader } from "./types";

const API = "https://api.ashbyhq.com/posting-api/job-board";
const PAGE = "https://jobs.ashbyhq.com";

type Address = { postalAddress?: { addressCountry?: string } } | null;
type AshbyJob = {
  id: string;
  title: string;
  jobUrl: string;
  location?: string;
  address?: Address;
  secondaryLocations?: { location?: string; address?: Address }[];
  isRemote?: boolean | null;
  isListed?: boolean;
  publishedAt?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

// "Deliveroo Jobs" / "Jobs at Deliveroo" → "Deliveroo".
const companyFromTitle = (title: string | null) =>
  title?.replace(/^jobs at\s+/i, "").replace(/\s+(jobs|careers)$/i, "").trim() || null;

function toJob(j: AshbyJob): BoardJob {
  const places = [{ location: j.location, address: j.address }, ...(j.secondaryLocations ?? [])];
  const html = j.descriptionHtml ?? "";
  return {
    external_id: j.id,
    title: j.title.trim(),
    description_html: html,
    description_text: j.descriptionPlain?.trim() || htmlToText(html),
    apply_url: j.jobUrl,
    locations: places.map((p) => p.location?.trim() ?? "").filter(Boolean),
    countries: places.map((p) => p.address?.postalAddress?.addressCountry?.trim() ?? "").filter(Boolean),
    remote: typeof j.isRemote === "boolean" ? j.isRemote : null,
    posted_at: j.publishedAt ? new Date(j.publishedAt) : null,
  };
}

export const readAshby: BoardReader = async (boardKey, fetchFn = fetch) => {
  const key = encodeURIComponent(boardKey);
  const data = await getJson<{ jobs: AshbyJob[] }>(`${API}/${key}`, fetchFn);
  if (!data) return null;
  const page = await getText(`${PAGE}/${key}`, fetchFn);
  return {
    company_name: companyFromTitle(page ? pageTitle(page) : null),
    jobs: data.jobs.filter((j) => j.isListed !== false).map(toJob),
  };
};
