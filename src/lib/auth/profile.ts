import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, type ROLES } from "@/db/schema";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Role = (typeof ROLES)[number];

// Called on every sign-in. Creates the profile the first time; afterwards does nothing,
// so it never overwrites anything (e.g. an admin role).
export async function ensureProfile(userId: string, conn: Db = db): Promise<void> {
  await conn.insert(profiles).values({ user_id: userId }).onConflictDoNothing();
}

export async function getRole(userId: string, conn: Db = db): Promise<Role | null> {
  const rows = await conn.select({ role: profiles.role }).from(profiles).where(eq(profiles.user_id, userId));
  return (rows[0]?.role as Role | undefined) ?? null;
}
