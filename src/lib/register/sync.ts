import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { sponsorKey, type RegisterSponsor } from "./group";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ExistingSponsor = { id: number; name_normalised: string; town: string | null; removed_at: Date | null };

export type SyncPlan = {
  inserts: RegisterSponsor[]; // new employers
  updates: (RegisterSponsor & { id: number })[]; // still (or again) on the register
  removeIds: number[]; // live employers no longer on the register
  reactivated: number; // previously removed, now back
  liveBefore: number; // live employers in the database before this sync
};

// ── Planning (pure) ─────────────────────────────────────────────────────────

export function planSync(existing: ExistingSponsor[], incoming: RegisterSponsor[]): SyncPlan {
  const byKey = new Map(existing.map((e) => [sponsorKey(e.name_normalised, e.town), e]));
  const seen = new Set<number>();
  const plan: SyncPlan = {
    inserts: [],
    updates: [],
    removeIds: [],
    reactivated: 0,
    liveBefore: existing.filter((e) => e.removed_at === null).length,
  };

  for (const s of incoming) {
    const match = byKey.get(sponsorKey(s.name_normalised, s.town));
    if (!match) {
      plan.inserts.push(s);
      continue;
    }
    seen.add(match.id);
    plan.updates.push({ id: match.id, ...s });
    if (match.removed_at !== null) plan.reactivated++;
  }

  for (const e of existing) {
    if (e.removed_at === null && !seen.has(e.id)) plan.removeIds.push(e.id);
  }
  return plan;
}

// ── Safety check ────────────────────────────────────────────────────────────

// A broken or truncated download must never wipe out the register.
export const MIN_SPONSORS = 50_000; // the real register has ~127,000 employers
export const MAX_REMOVAL_SHARE = 0.05; // normal days remove a few hundred at most

// Returns why the sync is unsafe, or null if it's fine.
export function checkSafety(p: { incomingCount: number; removeCount: number; liveBefore: number }): string | null {
  if (p.incomingCount < MIN_SPONSORS) {
    return `The register file has only ${p.incomingCount} employers (expected over ${MIN_SPONSORS}); it may be incomplete.`;
  }
  if (p.liveBefore > 0 && p.removeCount / p.liveBefore > MAX_REMOVAL_SHARE) {
    return `This sync would remove ${p.removeCount} of ${p.liveBefore} live employers (over ${MAX_REMOVAL_SHARE * 100}%).`;
  }
  return null;
}

// ── Database ────────────────────────────────────────────────────────────────

const BATCH = 1000;
const chunks = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) => items.slice(i * BATCH, (i + 1) * BATCH));

export async function loadExisting(conn: Db = db): Promise<ExistingSponsor[]> {
  return conn
    .select({
      id: sponsors.id,
      name_normalised: sponsors.name_normalised,
      town: sponsors.town,
      removed_at: sponsors.removed_at,
    })
    .from(sponsors);
}

// Writes the plan. Run inside a transaction so a failure leaves the table unchanged.
// Batches go to Postgres as one JSON text parameter each (::text::jsonb: sending it typed as
// jsonb makes the driver JSON-encode the string a second time).
export async function applySync(conn: Db, plan: SyncPlan, now: Date): Promise<void> {
  for (const batch of chunks(plan.inserts)) {
    await conn.insert(sponsors).values(batch.map((s) => ({ ...s, first_seen_at: now, last_seen_at: now })));
  }

  for (const batch of chunks(plan.updates)) {
    await conn.execute(sql`
      update sponsors as s set
        name = v.name, town = v.town, county = v.county, routes = v.routes, rating = v.rating,
        is_agency = v.is_agency, agency_reason = v.agency_reason,
        last_seen_at = ${now}, removed_at = null
      from jsonb_to_recordset(${JSON.stringify(batch)}::text::jsonb) as v(
        id bigint, name text, town text, county text, routes text[], rating text, is_agency boolean, agency_reason text
      )
      where s.id = v.id`);
  }

  for (const batch of chunks(plan.removeIds)) {
    await conn.execute(sql`
      update sponsors set removed_at = ${now}
      where id in (select jsonb_array_elements_text(${JSON.stringify(batch)}::text::jsonb)::bigint)`);
  }
}
