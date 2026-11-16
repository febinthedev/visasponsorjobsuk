CREATE TABLE "alerts_sent" (
	"user_id" uuid,
	"job_id" bigint,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_sent_pkey" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "alerts_sent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sponsor_id" bigint NOT NULL,
	"system" text NOT NULL,
	"board_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_sources_system_board_key_unique" UNIQUE("system","board_key"),
	CONSTRAINT "job_sources_system_check" CHECK ("system" in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'workday', 'nhs_jobs', 'trac')),
	CONSTRAINT "job_sources_status_check" CHECK ("status" in ('active', 'not_found', 'error', 'ambiguous'))
);
--> statement-breakpoint
ALTER TABLE "job_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" bigint NOT NULL,
	"sponsor_id" bigint NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text NOT NULL,
	"description_text" text NOT NULL,
	"apply_url" text NOT NULL,
	"locations" text[] NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"category" text NOT NULL,
	"salary_text" text,
	"salary_min" integer,
	"salary_max" integer,
	"hours_text" text,
	"hours_per_week" numeric(4,1),
	"employment_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"contract_months" integer,
	"seniority" text DEFAULT 'unknown' NOT NULL,
	"min_years_experience" integer,
	"soc_code" text,
	"label" text NOT NULL,
	"label_reason" text NOT NULL,
	"label_evidence" text,
	"rules_version" text NOT NULL,
	"labelled_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"content_hash" text NOT NULL,
	"search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', "jobs"."title"), 'A') || setweight(to_tsvector('english', "jobs"."description_text"), 'B')) STORED,
	CONSTRAINT "jobs_source_id_external_id_unique" UNIQUE("source_id","external_id"),
	CONSTRAINT "jobs_category_check" CHECK ("category" in ('healthcare', 'software_it', 'engineering', 'finance', 'business', 'marketing', 'sales', 'design', 'education', 'other')),
	CONSTRAINT "jobs_employment_types_check" CHECK ("employment_types" <@ array['full_time', 'part_time', 'fixed_term', 'zero_hours', 'freelance', 'early_careers']::text[]),
	CONSTRAINT "jobs_seniority_check" CHECK ("seniority" in ('graduate', 'junior', 'mid', 'senior', 'lead', 'unknown')),
	CONSTRAINT "jobs_label_check" CHECK ("label" in ('sponsorship_offered', 'likely_eligible', 'likely_eligible_new_entrant', 'open_to_all')),
	CONSTRAINT "jobs_salary_range_check" CHECK ("salary_max" is null or "salary_min" is null or "salary_max" >= "salary_min")
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "occupation_titles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "occupation_titles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title_normalised" text NOT NULL,
	"soc_code" text NOT NULL,
	CONSTRAINT "occupation_titles_title_normalised_soc_code_unique" UNIQUE("title_normalised","soc_code")
);
--> statement-breakpoint
ALTER TABLE "occupation_titles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "occupations" (
	"soc_code" text PRIMARY KEY,
	"title" text NOT NULL,
	"is_eligible" boolean NOT NULL,
	"going_rate" integer,
	"new_entrant_going_rate" integer,
	"source_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occupations_soc_code_check" CHECK ("soc_code" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "occupations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "passes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"stripe_checkout_session_id" text NOT NULL UNIQUE,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passes_kind_check" CHECK ("kind" in ('week', 'month', 'lifetime')),
	CONSTRAINT "passes_lifetime_end_check" CHECK (("kind" = 'lifetime') = ("ends_at" is null)),
	CONSTRAINT "passes_ends_after_starts_check" CHECK ("ends_at" is null or "ends_at" > "starts_at")
);
--> statement-breakpoint
ALTER TABLE "passes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY,
	"role" text DEFAULT 'user' NOT NULL,
	"education_level" text,
	"education_subject" text,
	"years_experience" integer,
	"job_titles" text[] DEFAULT '{}'::text[] NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"visa_status" text,
	"birth_month" date,
	"telegram_chat_id" bigint UNIQUE,
	"telegram_link_token" text UNIQUE,
	"telegram_linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_role_check" CHECK ("role" in ('user', 'admin')),
	CONSTRAINT "profiles_education_level_check" CHECK ("education_level" in ('gcse', 'a_level', 'bachelors', 'masters', 'phd', 'other')),
	CONSTRAINT "profiles_visa_status_check" CHECK ("visa_status" in ('student', 'graduate', 'skilled_worker', 'other_visa', 'no_visa_needed')),
	CONSTRAINT "profiles_years_experience_check" CHECK ("years_experience" >= 0),
	CONSTRAINT "profiles_birth_month_check" CHECK (extract(day from "birth_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"version" text PRIMARY KEY,
	"general_threshold" integer NOT NULL,
	"new_entrant_threshold" integer NOT NULL,
	"effective_from" date NOT NULL,
	"source_url" text NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}' NOT NULL,
	"error" text,
	CONSTRAINT "runs_kind_check" CHECK ("kind" in ('register', 'companies_house', 'discovery', 'jobs', 'alerts', 'reminders')),
	CONSTRAINT "runs_status_check" CHECK ("status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"user_id" uuid,
	"job_id" bigint,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_pkey" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "saved_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sponsors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_normalised" text NOT NULL,
	"town" text,
	"county" text,
	"routes" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_agency" boolean DEFAULT false NOT NULL,
	"agency_reason" text,
	"company_number" text,
	"company_number_status" text,
	"company_checked_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "sponsors_name_normalised_town_unique" UNIQUE NULLS NOT DISTINCT("name_normalised","town"),
	CONSTRAINT "sponsors_company_number_status_check" CHECK ("company_number_status" in ('matched', 'not_found', 'ambiguous'))
);
--> statement-breakpoint
ALTER TABLE "sponsors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "alerts_sent_job_id_index" ON "alerts_sent" ("job_id");--> statement-breakpoint
CREATE INDEX "job_sources_sponsor_id_index" ON "job_sources" ("sponsor_id");--> statement-breakpoint
CREATE INDEX "jobs_sponsor_id_index" ON "jobs" ("sponsor_id");--> statement-breakpoint
CREATE INDEX "jobs_soc_code_index" ON "jobs" ("soc_code");--> statement-breakpoint
CREATE INDEX "jobs_live_label_posted_idx" ON "jobs" ("label","posted_at" DESC NULLS LAST) WHERE "closed_at" is null;--> statement-breakpoint
CREATE INDEX "jobs_live_category_idx" ON "jobs" ("category") WHERE "closed_at" is null;--> statement-breakpoint
CREATE INDEX "jobs_closed_at_idx" ON "jobs" ("closed_at") WHERE "closed_at" is not null;--> statement-breakpoint
CREATE INDEX "jobs_search_idx" ON "jobs" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "occupation_titles_soc_code_index" ON "occupation_titles" ("soc_code");--> statement-breakpoint
CREATE INDEX "passes_user_id_index" ON "passes" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_sets_one_active_idx" ON "rule_sets" ("is_active") WHERE "is_active";--> statement-breakpoint
CREATE INDEX "runs_kind_started_at_index" ON "runs" ("kind","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_jobs_job_id_index" ON "saved_jobs" ("job_id");--> statement-breakpoint
CREATE INDEX "sponsors_company_number_index" ON "sponsors" ("company_number");--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_user_id_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_sponsor_id_sponsors_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_job_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "job_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_sponsor_id_sponsors_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_soc_code_occupations_soc_code_fkey" FOREIGN KEY ("soc_code") REFERENCES "occupations"("soc_code") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "occupation_titles" ADD CONSTRAINT "occupation_titles_soc_code_occupations_soc_code_fkey" FOREIGN KEY ("soc_code") REFERENCES "occupations"("soc_code") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_user_id_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;