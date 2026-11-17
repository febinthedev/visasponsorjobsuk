// Pure side of job collection: turn a board's jobs into UK-only rows, and work out what changed
// since the last read (new, edited, unchanged, gone).
import { createHash } from "node:crypto";
import type { BoardJob } from "@/lib/sources/types";
import { ukCheck } from "@/lib/uk/location";

export type JobRow = {
  external_id: string;
  title: string;
  description_html: string;
  description_text: string;
  apply_url: string;
  locations: string[]; // UK places only
  is_remote: boolean;
  posted_at: Date | null;
  content_hash: string; // fingerprint of the fields above, to spot edits
};

export type ExistingJob = { id: number; external_id: string; content_hash: string; closed_at: Date | null };

export type BoardPlan = {
  insert: JobRow[];
  update: (JobRow & { id: number })[]; // edited ads: stored again and re-labelled
  seenIds: number[]; // unchanged ads still on the board (closed ones reopen)
  closeIds: number[]; // live ads no longer on the board
};

export function ukJobRows(jobs: BoardJob[]): { rows: JobRow[]; dropped: number } {
  const rows: JobRow[] = [];
  const ids = new Set<string>();
  let dropped = 0;
  for (const j of jobs) {
    if (ids.has(j.external_id)) continue;
    const uk = ukCheck(j);
    if (!uk.uk) {
      dropped++;
      continue;
    }
    ids.add(j.external_id);
    const row = {
      external_id: j.external_id,
      title: j.title,
      description_html: j.description_html,
      description_text: j.description_text,
      apply_url: j.apply_url,
      locations: uk.ukLocations,
      is_remote: j.remote === true,
      posted_at: j.posted_at,
    };
    const content_hash = createHash("sha256")
      .update(JSON.stringify([row.title, row.description_html, row.apply_url, row.locations, row.is_remote, row.posted_at]))
      .digest("hex");
    rows.push({ ...row, content_hash });
  }
  return { rows, dropped };
}

export function planBoard(existing: ExistingJob[], rows: JobRow[]): BoardPlan {
  const byExternal = new Map(existing.map((e) => [e.external_id, e]));
  const onBoard = new Set(rows.map((r) => r.external_id));
  const plan: BoardPlan = { insert: [], update: [], seenIds: [], closeIds: [] };
  for (const r of rows) {
    const e = byExternal.get(r.external_id);
    if (!e) plan.insert.push(r);
    else if (e.content_hash !== r.content_hash) plan.update.push({ ...r, id: e.id });
    else plan.seenIds.push(e.id);
  }
  for (const e of existing) if (!e.closed_at && !onBoard.has(e.external_id)) plan.closeIds.push(e.id);
  return plan;
}
