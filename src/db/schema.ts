import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// Allowed values for text columns (kept as text + check constraint, easier to change than enums).
export const COMPANY_NUMBER_STATUSES = ["matched", "not_found", "ambiguous"] as const;
export const RATINGS = ["a", "b", "provisional"] as const;
export const SOURCE_SYSTEMS = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "workday", "nhs_jobs", "trac"] as const;
export const SOURCE_STATUSES = ["active", "not_found", "error", "ambiguous"] as const;
export const DISCOVERY_RESULTS = ["not_found", "no_name", "no_uk_jobs", "no_match", "ambiguous", "matched", "error"] as const;
export const CATEGORIES = ["healthcare", "software_it", "engineering", "finance", "business", "marketing", "sales", "design", "education", "other"] as const;
// Empty list = the ad did not say. Combinations are allowed, e.g. {full_time, fixed_term}.
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "fixed_term", "zero_hours", "freelance", "early_careers"] as const;
export const SENIORITIES = ["graduate", "junior", "mid", "senior", "lead", "unknown"] as const;
export const LABELS = ["sponsorship_offered", "likely_eligible", "likely_eligible_new_entrant", "open_to_all"] as const;
export const ROLES = ["user", "admin"] as const;
export const EDUCATION_LEVELS = ["gcse", "a_level", "bachelors", "masters", "phd", "other"] as const;
export const VISA_STATUSES = ["student", "graduate", "skilled_worker", "other_visa", "no_visa_needed"] as const;
export const PASS_KINDS = ["week", "month", "lifetime"] as const;
export const RUN_KINDS = ["register", "companies_house", "discovery", "jobs", "alerts", "reminders"] as const;
export const RUN_STATUSES = ["running", "succeeded", "failed"] as const;

const oneOf = (col: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${col} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

const id = () => bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const ts = () => timestamp({ withTimezone: true });
const createdAt = () => ts().notNull().defaultNow();

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// ── A. Employers and sources ────────────────────────────────────────────────

export const sponsors = pgTable.withRLS(
  "sponsors",
  {
    // Internal row ID.
    id: id(),
    // Employer name exactly as written on the Home Office register.
    name: text().notNull(),
    // Lowercased name with noise like "Ltd"/"Limited" removed; used for matching.
    name_normalised: text().notNull(),
    // Town from the register (can be blank).
    town: text(),
    // County from the register (can be blank).
    county: text(),
    // Visa routes the licence covers, e.g. {"Skilled Worker"}.
    routes: text().array().notNull().default(sql`'{}'`),
    // Rating of the Worker licence (the one covering Skilled Worker): a (incl. Premium / SME+),
    // b (downgraded; generally can't sponsor new workers) or provisional (UK Expansion Worker).
    // Empty = only a Temporary Worker licence, or a rating we didn't recognise. Only "a" can earn
    // the Sponsorship offered / Likely eligible labels.
    rating: text(),
    // True if this employer is a recruitment/staffing agency; agencies are never scraped.
    is_agency: boolean().notNull().default(false),
    // Which rule flagged it as an agency, so a wrong flag can be traced and fixed.
    agency_reason: text(),
    // Companies House number, when a single confident match was found.
    company_number: text(),
    // Result of the Companies House lookup: matched, not_found or ambiguous (empty = not checked yet).
    company_number_status: text(),
    // When the Companies House lookup last ran for this employer.
    company_checked_at: ts(),
    // When this employer first appeared on the register.
    first_seen_at: createdAt(),
    // When this employer was last seen on the register.
    last_seen_at: createdAt(),
    // When the employer dropped off the register (empty = still licensed).
    removed_at: ts(),
  },
  (t) => [
    unique().on(t.name_normalised, t.town).nullsNotDistinct(),
    index().on(t.company_number),
    check("sponsors_company_number_status_check", oneOf(t.company_number_status, COMPANY_NUMBER_STATUSES)),
    check("sponsors_rating_check", oneOf(t.rating, RATINGS)),
  ],
);

export const job_sources = pgTable.withRLS(
  "job_sources",
  {
    // Internal row ID.
    id: id(),
    // The employer this careers board belongs to.
    sponsor_id: bigint({ mode: "number" }).notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    // Hiring system the board runs on, e.g. greenhouse, lever, workday, nhs_jobs.
    system: text().notNull(),
    // The employer's board name/ID on that system (used to build the feed URL).
    board_key: text().notNull(),
    // active, not_found (no board there), error (last read failed) or ambiguous (can't tell which employer owns it; skipped).
    status: text().notNull().default("active"),
    // When we last tried to read this board.
    last_checked_at: ts(),
    // When we last read this board successfully.
    last_success_at: ts(),
    // Error message from the last failed read.
    last_error: text(),
    // When this board was first discovered.
    created_at: createdAt(),
  },
  (t) => [
    unique().on(t.system, t.board_key),
    index().on(t.sponsor_id),
    check("job_sources_system_check", oneOf(t.system, SOURCE_SYSTEMS)),
    check("job_sources_status_check", oneOf(t.status, SOURCE_STATUSES)),
  ],
);

export const discovery_checks = pgTable.withRLS(
  "discovery_checks",
  {
    // Hiring system the board name was tried on.
    system: text().notNull(),
    // The board name tried (e.g. "monzo"); with system, identifies one check.
    board_key: text().notNull(),
    // not_found (no board), no_name (board gives no company name), no_uk_jobs, no_match (name fits
    // no employer), ambiguous (fits several), matched (added to job_sources) or error (read failed).
    result: text().notNull(),
    // The company name the board showed, if any, so it can be re-matched without asking again.
    company_name: text(),
    // When it was last checked; old checks can be retried later.
    checked_at: ts().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.system, t.board_key] }),
    check("discovery_checks_system_check", oneOf(t.system, SOURCE_SYSTEMS)),
    check("discovery_checks_result_check", oneOf(t.result, DISCOVERY_RESULTS)),
  ],
);

// ── C. Home Office rules (data, not code) ───────────────────────────────────

export const rule_sets = pgTable.withRLS(
  "rule_sets",
  {
    // Name of this set of Home Office figures, e.g. "2025-07"; stored on each job it labelled.
    version: text().primaryKey(),
    // Skilled Worker general minimum salary (£ per year).
    general_threshold: integer().notNull(),
    // Lower minimum salary for new entrants (£ per year).
    new_entrant_threshold: integer().notNull(),
    // Date these figures took effect.
    effective_from: date().notNull(),
    // gov.uk page the figures were copied from.
    source_url: text().notNull(),
    // Anything worth remembering about this rule set.
    notes: text(),
    // True for the one rule set currently used to label jobs.
    is_active: boolean().notNull().default(false),
    // When this rule set was added.
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("rule_sets_one_active_idx").on(t.is_active).where(sql`${t.is_active}`)],
);

export const occupations = pgTable.withRLS(
  "occupations",
  {
    // 4-digit SOC 2020 occupation code.
    soc_code: text().primaryKey(),
    // Official occupation title for the code.
    title: text().notNull(),
    // True if this occupation can be sponsored under Skilled Worker.
    is_eligible: boolean().notNull(),
    // Minimum salary for this occupation (£ per year).
    going_rate: integer(),
    // Lower going rate for new entrants (£ per year).
    new_entrant_going_rate: integer(),
    // gov.uk page these figures came from.
    source_url: text().notNull(),
    // When this row was last updated.
    updated_at: createdAt(),
  },
  (t) => [check("occupations_soc_code_check", sql`${t.soc_code} ~ '^[0-9]{4}$'`)],
);

export const occupation_titles = pgTable.withRLS(
  "occupation_titles",
  {
    // Internal row ID.
    id: id(),
    // A job title from the ONS coding index, lowercased and cleaned for matching.
    title_normalised: text().notNull(),
    // The occupation code that job title maps to.
    soc_code: text().notNull().references(() => occupations.soc_code, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.title_normalised, t.soc_code), index().on(t.soc_code)],
);

// ── B. Jobs ─────────────────────────────────────────────────────────────────

export const jobs = pgTable.withRLS(
  "jobs",
  {
    // Internal row ID.
    id: id(),
    // The careers board this job was collected from.
    source_id: bigint({ mode: "number" }).notNull().references(() => job_sources.id, { onDelete: "cascade" }),
    // The employer that posted the job.
    sponsor_id: bigint({ mode: "number" }).notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    // The job's own ID on the employer's hiring system.
    external_id: text().notNull(),

    // Job title as written in the ad.
    title: text().notNull(),
    // Full job description as the employer wrote it (shown on the site).
    description_html: text().notNull(),
    // Plain-text version of the description, used for reading the ad and search.
    description_text: text().notNull(),
    // Link to apply on the employer's own site.
    apply_url: text().notNull(),

    // UK places the job is based in (non-UK places are dropped).
    locations: text().array().notNull(),
    // True if the job can be done remotely within the UK.
    is_remote: boolean().notNull().default(false),

    // Job category for browsing, e.g. healthcare, software_it (empty until the job is read/labelled).
    category: text(),
    // Salary exactly as written in the ad.
    salary_text: text(),
    // Lower end of the salary, converted to £ per year (used for the threshold check).
    salary_min: integer(),
    // Upper end of the salary, converted to £ per year.
    salary_max: integer(),
    // Working hours as written in the ad.
    hours_text: text(),
    // Weekly hours worked out from the ad.
    hours_per_week: numeric({ precision: 4, scale: 1 }),
    // Job type(s): full_time, part_time, fixed_term, zero_hours, freelance, early_careers (empty = not stated).
    employment_types: text().array().notNull().default(sql`'{}'`),
    // Length of a fixed-term contract in months (for the 12-month rule).
    contract_months: integer(),
    // Level: graduate, junior, mid, senior, lead or unknown.
    seniority: text().notNull().default("unknown"),
    // Years of experience the ad asks for, if stated.
    min_years_experience: integer(),
    // Occupation code the job title was matched to (empty = no confident match).
    soc_code: text().references(() => occupations.soc_code, { onDelete: "set null" }),

    // Sponsorship label: sponsorship_offered, likely_eligible, likely_eligible_new_entrant or open_to_all.
    // Empty = collected but not yet labelled; unlabelled jobs are hidden everywhere on the site.
    label: text(),
    // Which rule decided the label.
    label_reason: text(),
    // The phrase from the ad that triggered the label, if any.
    label_evidence: text(),
    // Which rule set was used to label this job.
    rules_version: text(),
    // When the label was last worked out.
    labelled_at: ts(),

    // Posting date given by the employer, if any.
    posted_at: ts(),
    // When we first collected this job.
    first_seen_at: createdAt(),
    // When we last saw this job on the employer's feed.
    last_seen_at: createdAt(),
    // When the job disappeared from the feed (empty = live). Deleted 7 days later.
    closed_at: ts(),
    // Fingerprint of the ad's content, to spot when the employer edits it.
    content_hash: text().notNull(),

    // Search index built automatically from the title and description.
    search_vector: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', ${jobs.title}), 'A') || setweight(to_tsvector('english', ${jobs.description_text}), 'B')`,
    ),
  },
  (t) => [
    unique().on(t.source_id, t.external_id),
    index().on(t.sponsor_id),
    index().on(t.soc_code),
    index("jobs_live_label_posted_idx").on(t.label, t.posted_at.desc()).where(sql`${t.closed_at} is null`),
    index("jobs_live_category_idx").on(t.category).where(sql`${t.closed_at} is null`),
    index("jobs_closed_at_idx").on(t.closed_at).where(sql`${t.closed_at} is not null`),
    index("jobs_search_idx").using("gin", t.search_vector),
    check("jobs_category_check", oneOf(t.category, CATEGORIES)),
    check(
      "jobs_employment_types_check",
      sql`${t.employment_types} <@ array[${sql.raw(EMPLOYMENT_TYPES.map((v) => `'${v}'`).join(", "))}]::text[]`,
    ),
    check("jobs_seniority_check", oneOf(t.seniority, SENIORITIES)),
    check("jobs_label_check", oneOf(t.label, LABELS)),
    check("jobs_salary_range_check", sql`${t.salary_max} is null or ${t.salary_min} is null or ${t.salary_max} >= ${t.salary_min}`),
  ],
);

// ── D. Users, payments and alerts ───────────────────────────────────────────

export const profiles = pgTable.withRLS(
  "profiles",
  {
    // The user's Supabase login ID.
    user_id: uuid().primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
    // user or admin.
    role: text().notNull().default("user"),
    // Highest qualification: gcse, a_level, bachelors, masters, phd or other.
    education_level: text(),
    // Subject of that qualification.
    education_subject: text(),
    // Total years of professional experience.
    years_experience: integer(),
    // Job titles the user has held or wants (used for matching).
    job_titles: text().array().notNull().default(sql`'{}'`),
    // Job categories the user is interested in.
    categories: text().array().notNull().default(sql`'{}'`),
    // Current situation: student, graduate, skilled_worker, other_visa or no_visa_needed.
    visa_status: text(),
    // Month and year of birth (stored as the 1st), used to work out "under 26".
    birth_month: date(),
    // The user's Telegram chat, once linked; alerts are sent here.
    telegram_chat_id: bigint({ mode: "number" }).unique(),
    // One-time code used to link the user's Telegram account.
    telegram_link_token: text().unique(),
    // When Telegram was linked.
    telegram_linked_at: ts(),
    // When the profile was created.
    created_at: createdAt(),
    // When the profile was last changed.
    updated_at: createdAt().$onUpdate(() => new Date()),
  },
  (t) => [
    check("profiles_role_check", oneOf(t.role, ROLES)),
    check("profiles_education_level_check", oneOf(t.education_level, EDUCATION_LEVELS)),
    check("profiles_visa_status_check", oneOf(t.visa_status, VISA_STATUSES)),
    check("profiles_years_experience_check", sql`${t.years_experience} >= 0`),
    check("profiles_birth_month_check", sql`extract(day from ${t.birth_month}) = 1`),
  ],
);

export const passes = pgTable.withRLS(
  "passes",
  {
    // Internal row ID.
    id: id(),
    // Who bought the pass.
    user_id: uuid().notNull().references(() => profiles.user_id, { onDelete: "cascade" }),
    // week, month or lifetime.
    kind: text().notNull(),
    // Price paid, in pence.
    amount_pence: integer().notNull(),
    // Stripe payment reference; unique so one payment can't create two passes.
    stripe_checkout_session_id: text().notNull().unique(),
    // When the pass starts (later than now if added on to an active pass).
    starts_at: ts().notNull(),
    // When the pass ends (empty for lifetime).
    ends_at: ts(),
    // When the 1-day expiry reminder was sent.
    reminder_sent_at: ts(),
    // When the pass was bought.
    created_at: createdAt(),
  },
  (t) => [
    index().on(t.user_id),
    check("passes_kind_check", oneOf(t.kind, PASS_KINDS)),
    check("passes_lifetime_end_check", sql`(${t.kind} = 'lifetime') = (${t.ends_at} is null)`),
    check("passes_ends_after_starts_check", sql`${t.ends_at} is null or ${t.ends_at} > ${t.starts_at}`),
  ],
);

export const saved_jobs = pgTable.withRLS(
  "saved_jobs",
  {
    // Who saved the job.
    user_id: uuid().notNull().references(() => profiles.user_id, { onDelete: "cascade" }),
    // The saved job.
    job_id: bigint({ mode: "number" }).notNull().references(() => jobs.id, { onDelete: "cascade" }),
    // When it was saved.
    saved_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.job_id] }), index().on(t.job_id)],
);

export const alerts_sent = pgTable.withRLS(
  "alerts_sent",
  {
    // Who was alerted.
    user_id: uuid().notNull().references(() => profiles.user_id, { onDelete: "cascade" }),
    // The job they were alerted about.
    job_id: bigint({ mode: "number" }).notNull().references(() => jobs.id, { onDelete: "cascade" }),
    // When the Telegram alert was sent.
    sent_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.job_id] }), index().on(t.job_id)],
);

// ── E. Operations ───────────────────────────────────────────────────────────

export const runs = pgTable.withRLS(
  "runs",
  {
    // Internal row ID.
    id: id(),
    // What ran: register, companies_house, discovery, jobs, alerts or reminders.
    kind: text().notNull(),
    // When the run started.
    started_at: createdAt(),
    // When it finished (empty = still running or crashed).
    finished_at: ts(),
    // running, succeeded or failed.
    status: text().notNull().default("running"),
    // Counts from the run, e.g. jobs added, closed, dropped as agency/non-UK.
    stats: jsonb().notNull().default({}),
    // Error message if the run failed.
    error: text(),
  },
  (t) => [
    index().on(t.kind, t.started_at.desc()),
    check("runs_kind_check", oneOf(t.kind, RUN_KINDS)),
    check("runs_status_check", oneOf(t.status, RUN_STATUSES)),
  ],
);
