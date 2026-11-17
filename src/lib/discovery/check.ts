// Checks one board name on one hiring system: does the board exist, does its name fit exactly one
// register employer, and does it have UK jobs? Never throws: a failed read becomes result "error".
import type { DISCOVERY_RESULTS } from "@/db/schema";
import type { SourceSystem } from "@/lib/sources";
import type { BoardReader } from "@/lib/sources/types";
import { ukCheck } from "@/lib/uk/location";
import { matchBoard, type SponsorIndex } from "./match";

export type DiscoveryResult = (typeof DISCOVERY_RESULTS)[number];

export type CheckOutcome = {
  system: SourceSystem;
  board_key: string;
  result: DiscoveryResult;
  company_name: string | null;
  sponsor_id?: number; // only when matched
  jobs?: number;
  uk_jobs?: number;
  error?: string;
};

export async function checkBoard(
  system: SourceSystem,
  boardKey: string,
  reader: BoardReader,
  index: SponsorIndex,
  fetchFn?: typeof fetch,
): Promise<CheckOutcome> {
  const base = { system, board_key: boardKey };
  let board;
  try {
    board = await reader(boardKey, fetchFn, { summary: true });
  } catch (err) {
    return { ...base, result: "error", company_name: null, error: err instanceof Error ? err.message : String(err) };
  }
  if (!board) return { ...base, result: "not_found", company_name: null };

  const company_name = board.company_name;
  const match = matchBoard(company_name, index);
  if (match.result !== "matched") return { ...base, result: match.result, company_name };

  const uk_jobs = board.jobs.filter((j) => ukCheck(j).uk).length;
  const counts = { jobs: board.jobs.length, uk_jobs };
  if (uk_jobs === 0) return { ...base, result: "no_uk_jobs", company_name, ...counts };
  return { ...base, result: "matched", company_name, sponsor_id: match.sponsorId, ...counts };
}
