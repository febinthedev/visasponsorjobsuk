CREATE TABLE "discovery_checks" (
	"system" text,
	"board_key" text,
	"result" text NOT NULL,
	"company_name" text,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_checks_pkey" PRIMARY KEY("system","board_key"),
	CONSTRAINT "discovery_checks_system_check" CHECK ("system" in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'workday', 'nhs_jobs', 'trac')),
	CONSTRAINT "discovery_checks_result_check" CHECK ("result" in ('not_found', 'no_name', 'no_uk_jobs', 'no_match', 'ambiguous', 'matched', 'error'))
);
--> statement-breakpoint
ALTER TABLE "discovery_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "label" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "label_reason" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "rules_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "labelled_at" DROP NOT NULL;