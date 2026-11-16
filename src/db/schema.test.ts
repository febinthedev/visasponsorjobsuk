import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

const dialect = new PgDialect();

const tables = Object.values(schema as Record<string, unknown>).filter((v): v is PgTable => is(v, PgTable));
const cfg = (t: PgTable) => getTableConfig(t);
const byName = (name: string) => {
  const t = tables.find((t) => cfg(t).name === name);
  if (!t) throw new Error(`table ${name} not found`);
  return cfg(t);
};
const column = (table: string, col: string) => {
  const c = byName(table).columns.find((c) => c.name === col);
  if (!c) throw new Error(`column ${table}.${col} not found`);
  return c;
};
const checkSql = (table: string, checkName: string) => {
  const c = byName(table).checks.find((c) => c.name === checkName);
  if (!c) throw new Error(`check ${checkName} not found on ${table}`);
  return dialect.sqlToQuery(c.value).sql;
};
const uniqueCols = (table: string) => {
  const t = byName(table);
  return [
    ...t.uniqueConstraints.map((u) => u.columns.map((c) => c.name).join(",")),
    ...t.indexes.filter((i) => i.config.unique).map((i) =>
      i.config.columns.map((c) => ("name" in c ? c.name : "?")).join(","),
    ),
    ...t.columns.filter((c) => c.isUnique).map((c) => c.name),
  ];
};
const fk = (table: string, col: string) => {
  const f = byName(table).foreignKeys.find((f) => f.reference().columns[0].name === col);
  if (!f) throw new Error(`no foreign key on ${table}.${col}`);
  const ref = f.reference();
  return { to: getTableConfig(ref.foreignTable).name, onDelete: f.onDelete };
};
const pkCols = (table: string) => {
  const t = byName(table);
  const composite = t.primaryKeys.flatMap((p) => p.columns.map((c) => c.name));
  return composite.length ? composite : t.columns.filter((c) => c.primary).map((c) => c.name);
};

describe("schema", () => {
  it("has exactly the 11 approved tables", () => {
    expect(tables.map((t) => cfg(t).name).sort()).toEqual(
      [
        "alerts_sent", "job_sources", "jobs", "occupation_titles", "occupations",
        "passes", "profiles", "rule_sets", "runs", "saved_jobs", "sponsors",
      ].sort(),
    );
  });

  it("enables row level security on every table, with no policies", () => {
    for (const t of tables) {
      expect(cfg(t).enableRLS, cfg(t).name).toBe(true);
      expect(cfg(t).policies, cfg(t).name).toHaveLength(0);
    }
  });

  describe("sponsors", () => {
    it("stores the Worker licence rating as a / b / provisional (optional)", () => {
      expect(column("sponsors", "rating").notNull).toBe(false);
      const s = checkSql("sponsors", "sponsors_rating_check");
      for (const v of ["a", "b", "provisional"]) expect(s).toContain(`'${v}'`);
    });

    it("is unique on normalised name + town, treating a blank town as a value", () => {
      const u = byName("sponsors").uniqueConstraints.find(
        (u) => u.columns.map((c) => c.name).join(",") === "name_normalised,town",
      );
      expect(u?.nullsNotDistinct).toBe(true);
    });

    it("does not make company_number unique (rows sharing a number are one employer)", () => {
      expect(uniqueCols("sponsors")).not.toContain("company_number");
    });

    it("limits company_number_status to matched / not_found / ambiguous", () => {
      const s = checkSql("sponsors", "sponsors_company_number_status_check");
      for (const v of ["matched", "not_found", "ambiguous"]) expect(s).toContain(`'${v}'`);
    });

    it("keeps agency flag and reason", () => {
      expect(column("sponsors", "is_agency").notNull).toBe(true);
      expect(column("sponsors", "agency_reason")).toBeDefined();
    });
  });

  describe("job_sources", () => {
    it("lets one board belong to only one sponsor", () => {
      expect(uniqueCols("job_sources")).toContain("system,board_key");
    });

    it("allows the ambiguous status", () => {
      expect(checkSql("job_sources", "job_sources_status_check")).toContain("'ambiguous'");
    });

    it("cascades when the sponsor is deleted", () => {
      expect(fk("job_sources", "sponsor_id")).toEqual({ to: "sponsors", onDelete: "cascade" });
    });
  });

  describe("jobs", () => {
    it("is unique per source + external id", () => {
      expect(uniqueCols("jobs")).toContain("source_id,external_id");
    });

    it("has the four labels and no 'excluded' label", () => {
      const s = checkSql("jobs", "jobs_label_check");
      for (const v of ["sponsorship_offered", "likely_eligible", "likely_eligible_new_entrant", "open_to_all"]) {
        expect(s).toContain(`'${v}'`);
      }
      expect(s).not.toContain("excluded");
    });

    it("records why a label was given and by which rules", () => {
      for (const c of ["label_reason", "rules_version", "labelled_at"]) expect(column("jobs", c).notNull, c).toBe(true);
      expect(column("jobs", "label_evidence")).toBeDefined();
    });

    it("stores job type as one list column instead of work pattern + contract type", () => {
      const names = byName("jobs").columns.map((c) => c.name);
      expect(names).not.toContain("work_pattern");
      expect(names).not.toContain("contract_type");
      const c = column("jobs", "employment_types");
      expect(c.notNull).toBe(true);
      expect(c.getSQLType()).toBe("text");
      expect(c.dimensions).toBe(1);
      expect(column("jobs", "contract_months")).toBeDefined();
    });

    it("allows only the six approved job types", () => {
      const s = checkSql("jobs", "jobs_employment_types_check");
      for (const v of ["full_time", "part_time", "fixed_term", "zero_hours", "freelance", "early_careers"]) {
        expect(s).toContain(`'${v}'`);
      }
      expect(s).toContain("<@");
    });

    it("has a generated full-text search column", () => {
      expect(column("jobs", "search_vector").generated).toBeDefined();
    });

    it("cascades from its source and sponsor", () => {
      expect(fk("jobs", "source_id")).toEqual({ to: "job_sources", onDelete: "cascade" });
      expect(fk("jobs", "sponsor_id")).toEqual({ to: "sponsors", onDelete: "cascade" });
    });
  });

  describe("rules data", () => {
    it("allows only one active rule set", () => {
      const idx = byName("rule_sets").indexes.find((i) => i.config.unique);
      expect(idx?.config.where).toBeDefined();
    });

    it("links occupation titles to occupations", () => {
      expect(fk("occupation_titles", "soc_code")).toEqual({ to: "occupations", onDelete: "cascade" });
    });
  });

  describe("profiles", () => {
    it("is keyed by the Supabase auth user and deleted with it", () => {
      expect(pkCols("profiles")).toEqual(["user_id"]);
      expect(fk("profiles", "user_id")).toEqual({ to: "users", onDelete: "cascade" });
    });

    it("defaults role to user and allows only user / admin", () => {
      expect(column("profiles", "role").default).toBe("user");
      const s = checkSql("profiles", "profiles_role_check");
      expect(s).toContain("'user'");
      expect(s).toContain("'admin'");
    });

    it("stores birth month (1st of the month) instead of a full date of birth", () => {
      expect(checkSql("profiles", "profiles_birth_month_check")).toMatch(/extract\(day from/i);
    });

    it("makes premium fields optional", () => {
      for (const c of ["education_level", "years_experience", "visa_status", "birth_month"]) {
        expect(column("profiles", c).notNull, c).toBe(false);
      }
    });

    it("has a unique Telegram chat and link token", () => {
      expect(uniqueCols("profiles")).toEqual(expect.arrayContaining(["telegram_chat_id", "telegram_link_token"]));
    });
  });

  describe("passes", () => {
    it("can't be created twice from one Stripe checkout", () => {
      expect(uniqueCols("passes")).toContain("stripe_checkout_session_id");
    });

    it("has no end date only for lifetime passes", () => {
      expect(checkSql("passes", "passes_lifetime_end_check")).toContain("lifetime");
    });
  });

  describe.each(["saved_jobs", "alerts_sent"])("%s", (table) => {
    it("is one row per user + job", () => {
      expect(pkCols(table)).toEqual(["user_id", "job_id"]);
    });

    it("is deleted when the job is deleted (closed jobs go after a week)", () => {
      expect(fk(table, "job_id")).toEqual({ to: "jobs", onDelete: "cascade" });
      expect(fk(table, "user_id")).toEqual({ to: "profiles", onDelete: "cascade" });
    });
  });

  it("indexes every foreign key column", () => {
    for (const t of tables) {
      const c = cfg(t);
      const leading = new Set([
        ...c.indexes.map((i) => {
          const first = i.config.columns[0];
          return "name" in first ? first.name : "";
        }),
        ...c.uniqueConstraints.map((u) => u.columns[0].name),
        ...c.primaryKeys.map((p) => p.columns[0].name),
        ...c.columns.filter((col) => col.primary).map((col) => col.name),
      ]);
      for (const f of c.foreignKeys) {
        const col = f.reference().columns[0].name;
        expect(leading.has(col), `${c.name}.${col}`).toBe(true);
      }
    }
  });
});
