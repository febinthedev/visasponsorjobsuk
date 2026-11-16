// Lever public Postings API: https://github.com/lever/postings-api
// Lever runs two data centres; a board lives on one of them, so the global one is tried first,
// then the EU one. The API gives no company name, so it comes from the board page's <title>.
import { htmlToText, pageTitle } from "./html";
import { getJson, getText } from "./http";
import type { BoardJob, BoardReader } from "./types";

const HOSTS = [
  { api: "https://api.lever.co", page: "https://jobs.lever.co" },
  { api: "https://api.eu.lever.co", page: "https://jobs.eu.lever.co" },
];

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  country?: string | null;
  workplaceType?: string | null; // "onsite" | "hybrid" | "remote" | "unspecified"
  categories?: { location?: string; allLocations?: string[] };
  description?: string;
  lists?: { text: string; content: string }[];
  additional?: string;
};

function toJob(p: LeverPosting): BoardJob {
  const html = [
    p.description ?? "",
    ...(p.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`),
    p.additional ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const places = p.categories?.allLocations?.length ? p.categories.allLocations : [p.categories?.location ?? ""];
  const type = p.workplaceType?.toLowerCase();
  return {
    external_id: p.id,
    title: p.text.trim(),
    description_html: html,
    description_text: htmlToText(html),
    apply_url: p.hostedUrl,
    locations: places.map((l) => l.trim()).filter(Boolean),
    countries: p.country ? [p.country] : [],
    remote: type === "remote" ? true : type && type !== "unspecified" ? false : null,
    posted_at: p.createdAt ? new Date(p.createdAt) : null,
  };
}

export const readLever: BoardReader = async (boardKey, fetchFn = fetch) => {
  const key = encodeURIComponent(boardKey);
  for (const host of HOSTS) {
    const postings = await getJson<LeverPosting[]>(`${host.api}/v0/postings/${key}?mode=json`, fetchFn);
    if (!postings) continue;
    const page = await getText(`${host.page}/${key}`, fetchFn);
    return { company_name: page ? pageTitle(page) : null, jobs: postings.map(toJob) };
  }
  return null;
};
