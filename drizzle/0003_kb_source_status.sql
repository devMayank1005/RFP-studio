ALTER TABLE "kb_sources" ADD COLUMN "status" "job_status" DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_sources" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "kb_sources" ADD COLUMN "entry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_sources" ADD COLUMN "progress_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_sources" ADD COLUMN "progress_total" integer DEFAULT 0 NOT NULL;