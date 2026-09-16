ALTER TABLE "exports" ADD COLUMN "status" "job_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;