// Greenhouse public Job Board API: https://developers.greenhouse.io/job-board.html
// One request for the board's name, one for all jobs with their descriptions.
import { decodeEntities, htmlToText } from "./html";
import { getJson } from "./http";
import type { Board, BoardJob, BoardReader } from "./types";

const API = "https://boards-api.greenhouse.io/v1/boards";

type GreenhouseJob = {
  id: number;
  title: string;
  content: string; // HTML, sent escaped ("&lt;p&gt;…")
  absolute_url: string;
  location?: { name?: string } | null;
  first_published?: string | null;
  updated_at?: string | null;
};

function toJob(j: GreenhouseJob): BoardJob {
  const html = decodeEntities(j.content ?? "");
  const published = j.first_published ?? j.updated_at;
  return {
    external_id: String(j.id),
    title: j.title.trim(),
    description_html: html,
    description_text: htmlToText(html),
    apply_url: j.absolute_url,
    locations: j.location?.name ? [j.location.name.trim()] : [],
    countries: [],
    remote: null,
    posted_at: published ? new Date(published) : null,
  };
}

export const readGreenhouse: BoardReader = async (boardKey, fetchFn = fetch) => {
  const base = `${API}/${encodeURIComponent(boardKey)}`;
  const info = await getJson<{ name?: string }>(base, fetchFn);
  if (!info) return null;
  const list = await getJson<{ jobs: GreenhouseJob[] }>(`${base}/jobs?content=true`, fetchFn);
  const board: Board = { company_name: info.name?.trim() || null, jobs: (list?.jobs ?? []).map(toJob) };
  return board;
};
