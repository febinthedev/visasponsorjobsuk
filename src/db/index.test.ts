import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { db } from "./index";

describe("database connection", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it("app client (transaction pooler) runs a query", async () => {
    const rows = await db.execute<{ ok: number }>(sql`select 1 as ok`);
    expect(rows[0].ok).toBe(1);
  });

  it("migration URL (session pooler) connects", async () => {
    const client = postgres(process.env.DIRECT_DATABASE_URL!, { max: 1 });
    try {
      const rows = await client`select 1 as ok`;
      expect(rows[0].ok).toBe(1);
    } finally {
      await client.end();
    }
  });
});
