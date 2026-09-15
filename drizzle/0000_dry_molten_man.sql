CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('standard', 'configurable', 'roadmap', 'not_available');--> statement-breakpoint
CREATE TYPE "public"."bidder" AS ENUM('kognoz', 'darwinbox', 'joint');--> statement-breakpoint
CREATE TYPE "public"."chro_status" AS ENUM('suggested', 'kept', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."chro_theme" AS ENUM('mandate_vision', 'scope_structure', 'operating_model', 'tech_ai', 'prioritization', 'governance_culture');--> statement-breakpoint
CREATE TYPE "public"."citation_source" AS ENUM('kb_entry', 'approved_answer', 'rfp_document');--> statement-breakpoint
CREATE TYPE "public"."compliance" AS ENUM('fully', 'partial', 'via_customization', 'via_partner', 'not_supported', 'na');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('rfp_main', 'appendix', 'client_pointers', 'our_prior_response', 'other');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('hris_implementation', 'advisory', 'joint_bid', 'managed_services');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('xlsx', 'docx', 'pptx');--> statement-breakpoint
CREATE TYPE "public"."generator" AS ENUM('model', 'user', 'import');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('parse', 'extract', 'draft', 'chro', 'export');--> statement-breakpoint
CREATE TYPE "public"."kb_entry_type" AS ENUM('darwinbox_capability', 'kognoz_service', 'case_study', 'boilerplate');--> statement-breakpoint
CREATE TYPE "public"."kb_source_kind" AS ENUM('darwinbox_docs', 'internal_doc', 'rfp_response');--> statement-breakpoint
CREATE TYPE "public"."module" AS ENUM('core_hr', 'payroll', 'time_attendance', 'leave', 'recruiting', 'onboarding', 'performance', 'learning', 'compensation', 'engagement', 'talent', 'analytics', 'helpdesk', 'expenses', 'travel', 'offboarding', 'ai_agents', 'mobile', 'integrations', 'security_compliance', 'data_migration', 'implementation', 'change_management', 'advisory', 'support', 'commercial', 'general');--> statement-breakpoint
CREATE TYPE "public"."owner" AS ENUM('kognoz', 'darwinbox', 'joint', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'parsing', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('compliance', 'descriptive', 'pricing', 'yes_no', 'attachment');--> statement-breakpoint
CREATE TYPE "public"."response_status" AS ENUM('ai_draft', 'edited', 'approved', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."rfp_status" AS ENUM('draft', 'parsing', 'questions_ready', 'drafting', 'in_review', 'approved', 'submitted', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text,
	"code" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#005184' NOT NULL,
	"accent_color" text DEFAULT '#2B9E85' NOT NULL,
	"success_color" text DEFAULT '#71A247' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"docx_template_url" text,
	"pptx_template_url" text,
	"footer_text" text,
	"voice_guide" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"hq_country" text,
	"countries_count" integer,
	"headcount" integer,
	"current_hrms" text,
	"group_structure" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"kind" "document_kind" DEFAULT 'rfp_main' NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"page_count" integer,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"parsed_text_url" text,
	"parse_error" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"section_id" uuid,
	"ref_no" text NOT NULL,
	"question_text" text NOT NULL,
	"acceptance_criteria" text,
	"question_type" "question_type" DEFAULT 'descriptive' NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"owner" "owner" DEFAULT 'joint' NOT NULL,
	"module_hint" "module" DEFAULT 'general' NOT NULL,
	"raw_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1024),
	"source_document_id" uuid,
	"source_row" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"title" text NOT NULL,
	"ref_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"engagement_type" "engagement_type" DEFAULT 'hris_implementation' NOT NULL,
	"bidder_of_record" "bidder" DEFAULT 'joint' NOT NULL,
	"status" "rfp_status" DEFAULT 'draft' NOT NULL,
	"due_date" date,
	"submitted_at" timestamp with time zone,
	"outcome_notes" text,
	"context_summary" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"source_type" "citation_source" NOT NULL,
	"source_id" uuid NOT NULL,
	"similarity" numeric(5, 4),
	"excerpt" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "response_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"draft_text" text NOT NULL,
	"final_text" text NOT NULL,
	"generated_by" "generator" NOT NULL,
	"author_id" text,
	"model" text,
	"prompt_version" text,
	"instruction" text,
	"open_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"current_revision_id" uuid,
	"status" "response_status" DEFAULT 'ai_draft' NOT NULL,
	"compliance" "compliance",
	"confidence" numeric(4, 3),
	"assignee_id" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"flag_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approved_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"origin_response_id" uuid,
	"origin_rfp_id" uuid,
	"canonical_question" text NOT NULL,
	"canonical_answer" text NOT NULL,
	"module" "module" DEFAULT 'general' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"embedding" vector(1024),
	"reuse_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"entry_type" "kb_entry_type" NOT NULL,
	"product" text NOT NULL,
	"module" "module" DEFAULT 'general' NOT NULL,
	"feature_name" text NOT NULL,
	"body" text NOT NULL,
	"availability" "availability" DEFAULT 'standard' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_id" uuid,
	"embedding" vector(1024),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "kb_source_kind" NOT NULL,
	"file_url" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chro_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"theme" "chro_theme" NOT NULL,
	"question_text" text NOT NULL,
	"rationale" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "chro_status" DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"format" "export_format" NOT NULL,
	"brand_template_id" uuid,
	"file_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress_done" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inngest_run_id" text,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_templates" ADD CONSTRAINT "brand_templates_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD CONSTRAINT "rfp_documents_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD CONSTRAINT "rfp_documents_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_questions" ADD CONSTRAINT "rfp_questions_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_questions" ADD CONSTRAINT "rfp_questions_section_id_rfp_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."rfp_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_questions" ADD CONSTRAINT "rfp_questions_source_document_id_rfp_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_sections" ADD CONSTRAINT "rfp_sections_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_citations" ADD CONSTRAINT "response_citations_revision_id_response_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."response_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_question_id_rfp_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."rfp_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_current_revision_id_response_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."response_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_answers" ADD CONSTRAINT "approved_answers_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_answers" ADD CONSTRAINT "approved_answers_origin_response_id_responses_id_fk" FOREIGN KEY ("origin_response_id") REFERENCES "public"."responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_answers" ADD CONSTRAINT "approved_answers_origin_rfp_id_rfps_id_fk" FOREIGN KEY ("origin_rfp_id") REFERENCES "public"."rfps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_source_id_kb_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."kb_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_sources" ADD CONSTRAINT "kb_sources_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chro_questions" ADD CONSTRAINT "chro_questions_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_brand_template_id_brand_templates_id_fk" FOREIGN KEY ("brand_template_id") REFERENCES "public"."brand_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "brand_templates_workspace_idx" ON "brand_templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "clients_workspace_idx" ON "clients" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "rfp_documents_rfp_idx" ON "rfp_documents" USING btree ("rfp_id");--> statement-breakpoint
CREATE INDEX "rfp_questions_rfp_sort_idx" ON "rfp_questions" USING btree ("rfp_id","sort_order");--> statement-breakpoint
CREATE INDEX "rfp_questions_section_idx" ON "rfp_questions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "rfp_sections_rfp_idx" ON "rfp_sections" USING btree ("rfp_id","sort_order");--> statement-breakpoint
CREATE INDEX "rfps_workspace_status_idx" ON "rfps" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "rfps_client_idx" ON "rfps" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "response_citations_revision_idx" ON "response_citations" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_revisions_version_uidx" ON "response_revisions" USING btree ("response_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_question_uidx" ON "responses" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "approved_answers_workspace_idx" ON "approved_answers" USING btree ("workspace_id","module");--> statement-breakpoint
CREATE INDEX "approved_answers_embedding_hnsw_idx" ON "approved_answers" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "kb_entries_workspace_module_idx" ON "kb_entries" USING btree ("workspace_id","module","is_active");--> statement-breakpoint
CREATE INDEX "kb_entries_embedding_hnsw_idx" ON "kb_entries" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "kb_sources_workspace_idx" ON "kb_sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "chro_questions_rfp_idx" ON "chro_questions" USING btree ("rfp_id","sort_order");--> statement-breakpoint
CREATE INDEX "exports_rfp_idx" ON "exports" USING btree ("rfp_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_rfp_idx" ON "generation_jobs" USING btree ("rfp_id","created_at");