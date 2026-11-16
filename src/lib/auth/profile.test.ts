import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { ensureProfile, getRole } from "./profile";

class Rollback extends Error {}

// Runs fn inside a transaction that is always rolled back, so the real database is left untouched.
async function inRollback(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

async function createAuthUser(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const id = randomUUID();
  await tx.execute(sql`insert into auth.users (id, email) values (${id}, ${`${id}@test.invalid`})`);
  return id;
}

afterAll(async () => {
  await db.$client.end();
});

describe("ensureProfile", () => {
  it("creates a profile with role 'user' on first sign-in", async () => {
    await inRollback(async (tx) => {
      const id = await createAuthUser(tx);
      await ensureProfile(id, tx);
      const rows = await tx.select().from(profiles).where(eq(profiles.user_id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("user");
    });
  });

  it("does nothing on later sign-ins and never resets an admin", async () => {
    await inRollback(async (tx) => {
      const id = await createAuthUser(tx);
      await ensureProfile(id, tx);
      await tx.update(profiles).set({ role: "admin" }).where(eq(profiles.user_id, id));
      await ensureProfile(id, tx);
      const rows = await tx.select().from(profiles).where(eq(profiles.user_id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("admin");
    });
  });
});

describe("getRole", () => {
  it("returns the stored role", async () => {
    await inRollback(async (tx) => {
      const id = await createAuthUser(tx);
      await ensureProfile(id, tx);
      expect(await getRole(id, tx)).toBe("user");
    });
  });

  it("returns null when there is no profile", async () => {
    expect(await getRole(randomUUID())).toBeNull();
  });
});
