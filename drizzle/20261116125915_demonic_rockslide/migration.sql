ALTER TABLE "sponsors" ADD COLUMN "rating" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_rating_check" CHECK ("rating" in ('a', 'b', 'provisional'));