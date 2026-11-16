// Workable public widget API (the one behind employers' embedded job lists).
// `?details=true` includes each job's description and structured places with country codes,
// so one request reads the whole board.
import { htmlToText } from "./html";
import { getJson } from "./http";
import type { BoardJob, BoardReader } from "./types";

const API = "https://apply.workable.com/api/v1/widget/accounts";

type Place = { country?: string; countryCode?: string; city?: string; region?: string; hidden?: boolean };
type WorkableJob = {
  shortcode: string;
  title: string;
  url: string;
  description?: string;
  locations?: Place[];
  telecommuting?: boolean;
  published_on?: string;
};

function toJob(j: WorkableJob): BoardJob {
  const places = (j.locations ?? []).filter((p) => !p.hidden);
  const html = j.description ?? "";
  return {
    external_id: j.shortcode,
    title: j.title.trim(),
    description_html: html,
    description_text: htmlToText(html),
    apply_url: j.url,
    locations: places.map((p) => [p.city, p.region, p.country].map((s) => s?.trim()).filter(Boolean).join(", ")).filter(Boolean),
    countries: places.map((p) => p.countryCode?.trim() || p.country?.trim() || "").filter(Boolean),
    remote: typeof j.telecommuting === "boolean" ? j.telecommuting : null,
    posted_at: j.published_on ? new Date(j.published_on) : null,
  };
}

export const readWorkable: BoardReader = async (boardKey, fetchFn = fetch) => {
  const data = await getJson<{ name?: string; jobs?: WorkableJob[] }>(
    `${API}/${encodeURIComponent(boardKey)}?details=true`,
    fetchFn,
  );
  if (!data) return null;
  return { company_name: data.name?.trim() || null, jobs: (data.jobs ?? []).map(toJob) };
};
