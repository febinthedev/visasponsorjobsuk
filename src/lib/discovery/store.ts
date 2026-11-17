// Database side of discovery: which employers can be matched, which boards were already checked,
// and saving each check (plus matched boards into job_sources).
import { and, eq, gte, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { discovery_checks, job_sources, sponsors } from "@/db/schema";
import type { CheckOutcome } from "./check";
import { buildSponsorIndex, type SponsorIndex } from "./match";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Live, non-agency employers: the only ones a board may be matched to.
export async function loadSponsorIndex(conn: Db = db): Promise<SponsorIndex> {
  const rows = await conn
    .select({ id: sponsors.id, name_normalised: sponsors.name_normalised })
    .from(sponsors)
    .where(and(isNull(sponsors.removed_at), eq(sponsors.is_agency, false)));
  return buildSponsorIndex(rows);
}

// Boards checked since `since`, as "system:board_key"; older checks are due to be tried again.
// Failed checks (result "error", e.g. rate limited) are left out, so the next run retries them.
export async function loadCheckedKeys(conn: Db, since: Date): Promise<Set<string>> {
  const rows = await conn
    .select({ system: discovery_checks.system, board_key: discovery_checks.board_key })
    .from(discovery_checks)
    .where(and(gte(discovery_checks.checked_at, since), ne(discovery_checks.result, "error")));
  return new Set(rows.map((r) => `${r.system}:${r.board_key}`));
}

export async function saveOutcome(
  conn: Db,
  o: Pick<CheckOutcome, "system" | "board_key" | "result" | "company_name" | "sponsor_id">,
  now: Date,
): Promise<void> {
  const row = { result: o.result, company_name: o.company_name, checked_at: now };
  await conn
    .insert(discovery_checks)
    .values({ system: o.system, board_key: o.board_key, ...row })
    .onConflictDoUpdate({ target: [discovery_checks.system, discovery_checks.board_key], set: row });

  if (o.result === "matched" && o.sponsor_id) {
    await conn
      .insert(job_sources)
      .values({ sponsor_id: o.sponsor_id, system: o.system, board_key: o.board_key, status: "active", last_checked_at: now })
      .onConflictDoNothing({ target: [job_sources.system, job_sources.board_key] });
  }
}
