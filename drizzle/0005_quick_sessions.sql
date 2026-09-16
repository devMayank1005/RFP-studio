CREATE TYPE "public"."rfp_kind" AS ENUM('full', 'quick');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'quick';--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "kind" "rfp_kind" DEFAULT 'full' NOT NULL;