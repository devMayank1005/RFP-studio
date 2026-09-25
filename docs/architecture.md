# RFP Studio — Architecture v1

Kognoz's internal tool to turn a client RFP into a branded, line-wise proposal response plus a CHRO-level discovery question set — and to get smarter with every RFP it processes.

---

## 1. What the system has to do

**Functional**
1. Ingest an RFP in any shape it arrives (xlsx compliance matrix, docx/pdf narrative, "pointers" email) and extract a clean list of questions/requirements.
2. Draft a humanised, client-specific response per line item, grounded in (a) what Darwinbox HRMS can actually do, module by module, and (b) Kognoz's own advisory/implementation offerings.
3. Let a consultant review, edit, approve — and feed approved answers back into a knowledge base so the next RFP starts from better drafts.
4. Generate CHRO-level discussion questions (the "Group Mandate & Vision / Scope / Operating Model / Tech & AI / Prioritization / Governance & Culture" pattern) from the client's context and the gaps found in the RFP.
5. Export in Kognoz branding: xlsx (compliance matrix), docx (narrative proposal), pptx (joint value-prop deck).

**Non-functional**
- Volume is low (tens of RFPs a year, 50–400 line items each), so correctness and reviewability matter far more than throughput.
- Generation must be resumable: a 300-question RFP cannot run inside one HTTP request.
- Every AI draft must show *why* — which capability entry or past answer it drew on — so sales can trust it.
- Multi-user with roles (sales, consultant, reviewer, admin); one workspace for Kognoz, but the model must not hard-wire any client.

**Constraints (from your earlier decisions)**
- Next.js + Node + TypeScript, NeonDB, Vercel, Anthropic API.

---

## 2. Is MongoDB the right database? — No, stay on Neon Postgres

| Consideration | Neon Postgres | MongoDB Atlas |
|---|---|---|
| Data shape | Deeply relational: client → RFP → section → question → response → revision → approval. Joins are constant. | Would need manual referential integrity or heavy embedding of sub-documents; revision history gets awkward. |
| Semantic retrieval (the core of "draft from knowledge base") | `pgvector` lives in the same DB — one query joins vector similarity with module/owner/status filters. | Atlas Vector Search works but is a separate index with its own query syntax; harder to combine with relational filters. |
| Flexible question formats | `JSONB` column on `rfp_questions.raw_meta` gives schemaless flexibility exactly where you need it. | Native strength — but you only need it in one place. |
| Analytics ("which answers get reused most", "coverage by module") | SQL aggregates, trivially. | Aggregation pipeline, more verbose. |
| Dev workflow | Neon branching = free isolated DB per feature branch; already connected to your account; Drizzle ORM is excellent. | Fine, but no equivalent branching story on Vercel. |
| Cost at your scale | Free/near-free. | Free/near-free. |

**Decision: Neon Postgres + pgvector + JSONB, via Drizzle ORM.** MongoDB wouldn't fail you, but it buys you flexibility you don't need and costs you the joins and the co-located vector search you do need.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 15 (App Router) + TypeScript, deployed on Vercel | Server components for data-heavy grids; API routes + server actions in one codebase. |
| UI | Tailwind + shadcn/ui + TanStack Table + TipTap (rich-text editor) | Fast, branded, keyboard-friendly review grid. |
| Database | Neon Postgres + `pgvector`, Drizzle ORM | See §2. |
| AI | Anthropic API — Claude Sonnet for bulk drafting/extraction, Claude Opus for the CHRO question set and final narrative polish | Structured JSON outputs for extraction/drafts; tool use for retrieval. |
| Embeddings | Voyage AI (`voyage-3`) or OpenAI `text-embedding-3-small` | Anthropic doesn't ship embeddings; Voyage is Anthropic's recommended partner. |
| Background jobs | Inngest (Vercel-native, free tier) | Step functions with retries; each question is a durable step, so a 300-item run survives timeouts and can be resumed. |
| File storage | Neon Object Storage (S3-compatible private bucket on the database's branch) | Uploaded RFPs, parsed JSON, generated exports. Rows hold the object key; files from before September 2026 still hold a Vercel Blob URL until `pnpm storage:migrate` runs. |
| Parsing | SheetJS (xlsx), `unpdf` (pdf), `mammoth` (docx) → Claude for question extraction | Deterministic text extraction first, AI only for structuring. |
| Export | `docx` npm, `pptxgenjs`, SheetJS | Brand templates stored as JSON + logo assets. |
| Auth | Auth.js with Google Workspace SSO (Kognoz domain) | Zero password management. |
| Observability | Sentry (already connected) + Inngest dashboard | |

---

## 4. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js on Vercel                                                   │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐  │
│  │ App (RSC/UI) │──▶│ Server Actions / │──▶│ Domain services      │  │
│  │ dashboard    │   │ Route Handlers   │   │ rfp · question ·     │  │
│  │ rfp workspace│◀──│ (auth, zod)      │◀──│ response · kb ·      │  │
│  │ kb · exports │   └──────────────────┘   │ chro · export        │  │
│  └──────────────┘            │             └──────────┬───────────┘  │
└──────────────────────────────┼────────────────────────┼──────────────┘
                               │ enqueue                │ read/write
                               ▼                        ▼
                    ┌────────────────────┐    ┌──────────────────────┐
                    │ Inngest (jobs)     │    │ Neon Postgres        │
                    │ • parse_rfp        │───▶│ relational + JSONB   │
                    │ • extract_questions│    │ + pgvector           │
                    │ • draft_responses  │    └──────────────────────┘
                    │ • generate_chro    │
                    │ • build_export     │    ┌──────────────────────┐
                    └─────────┬──────────┘    │ Neon Object Storage  │
                              │               │ uploads · exports    │
                              ▼               └──────────────────────┘
                    ┌────────────────────┐
                    │ Anthropic API      │    ┌──────────────────────┐
                    │ + Voyage embeddings│    │ Sentry               │
                    └────────────────────┘    └──────────────────────┘
```

Rule of thumb: **the UI never calls Claude directly.** Every generation is a job with progress the UI subscribes to. That is what makes long RFPs safe and every draft auditable.

---

## 5. Data model (Postgres)

### 5.1 Entity map

```
users ──< memberships >── workspace
                              │
clients ──< rfps ──< rfp_documents
              │
              ├──< rfp_sections ──< rfp_questions ──< responses ──< response_revisions
              │                                          │
              │                                          └──< response_citations ──> (kb_entries | approved_answers)
              ├──< chro_questions
              ├──< generation_jobs
              └──< exports ──> brand_templates

knowledge base:
  kb_entries        (Darwinbox capabilities + Kognoz services)   [vector]
  approved_answers  (promoted from approved responses)           [vector]
  kb_sources        (where each entry came from)
```

### 5.2 Tables

**workspace / identity**
```sql
users            (id, email, name, avatar_url, created_at)
workspaces       (id, name, brand_template_id, created_at)
memberships      (user_id, workspace_id, role)      -- role: admin | consultant | sales | reviewer
```

**clients & RFPs**
```sql
clients          (id, workspace_id, name, industry, hq_country, countries_count,
                  headcount, current_hrms, group_structure jsonb, notes, created_at)

rfps             (id, workspace_id, client_id, title,
                  engagement_type,     -- hris_implementation | advisory | joint_bid | managed_services
                  bidder_of_record,    -- kognoz | darwinbox | joint
                  status,              -- draft | parsing | questions_ready | drafting | in_review | approved | submitted | won | lost
                  due_date, submitted_at, outcome_notes,
                  context_summary text,          -- AI-written 1-page brief used as system context for every draft
                  created_by, created_at, updated_at)

rfp_documents    (id, rfp_id, kind,           -- rfp_main | appendix | client_pointers | our_prior_response | other
                  file_url, mime, page_count, parse_status, parsed_text_url, created_at)

rfp_sections     (id, rfp_id, title, ref_code, sort_order)

rfp_questions    (id, rfp_id, section_id, ref_no,
                  question_text, question_type,   -- compliance | descriptive | pricing | yes_no | attachment
                  is_mandatory bool,
                  owner,                          -- kognoz | darwinbox | joint | not_applicable
                  module_hint,                    -- core_hr | payroll | recruiting | performance | learning | ... | advisory
                  raw_meta jsonb,                 -- original row/cell data, any client-specific columns
                  embedding vector(1024),
                  sort_order, created_at)
```

**responses**
```sql
responses        (id, question_id, current_revision_id,
                  status,              -- ai_draft | edited | approved | flagged
                  compliance,          -- fully | partial | via_customization | via_partner | not_supported | na
                  confidence numeric,  -- 0–1 from the model
                  assignee_id, approved_by, approved_at)

response_revisions (id, response_id, version int,
                  draft_text,          -- what the model produced
                  final_text,          -- what the human left
                  generated_by,        -- model | user_id
                  model, prompt_version, instruction,   -- "regenerate: shorter / more formal / cite SAP migration"
                  created_at)

response_citations (id, revision_id, source_type,   -- kb_entry | approved_answer | rfp_document
                  source_id, similarity numeric, excerpt)
```

**knowledge base**
```sql
kb_entries       (id, workspace_id,
                  entry_type,          -- darwinbox_capability | kognoz_service | case_study | boilerplate
                  product, module, feature_name,
                  body text,           -- canonical description of what's possible
                  availability,        -- standard | configurable | roadmap | not_available
                  tags text[], source_id, embedding vector(1024),
                  is_active bool, updated_at)

approved_answers (id, workspace_id, origin_response_id, origin_rfp_id,
                  canonical_question, canonical_answer,
                  module, tags text[], embedding vector(1024),
                  reuse_count int, last_used_at, created_at)

kb_sources       (id, workspace_id, name, kind,     -- darwinbox_docs | internal_doc | rfp_response
                  file_url, ingested_at)
```

**CHRO questions, jobs, exports**
```sql
chro_questions   (id, rfp_id, theme,         -- mandate_vision | scope_structure | operating_model | tech_ai | prioritization | governance_culture
                  question_text, rationale,  -- why we're asking; which gap/finding it comes from
                  sort_order, status)        -- suggested | kept | dropped

generation_jobs  (id, rfp_id, job_type,      -- parse | extract | draft | chro | export
                  status, progress_done int, progress_total int,
                  inngest_run_id, error, started_at, finished_at)

brand_templates  (id, workspace_id, name, logo_url, primary_color, secondary_color,
                  font_family, docx_template_url, pptx_template_url, footer_text)

exports          (id, rfp_id, format,        -- xlsx | docx | pptx
                  brand_template_id, file_url, created_by, created_at)

audit_log        (id, workspace_id, actor_id, entity, entity_id, action, diff jsonb, created_at)
```

Indexes that matter: `rfp_questions(rfp_id, sort_order)`, `responses(question_id)`, HNSW on all three `embedding` columns, GIN on `tags`.

---

## 6. Backend flow

### 6.1 Ingest → questions
1. **Upload** → `rfp_documents` row, file to the storage bucket, enqueue `parse_rfp`.
2. **parse_rfp**: deterministic text/table extraction per file type. xlsx rows are kept as JSON with their original headers (this becomes `raw_meta`).
3. **extract_questions**: Claude gets the parsed content in chunks and returns strict JSON — `{section, ref_no, question_text, question_type, is_mandatory, module_hint, owner_guess}`. Client "pointers" (like the demerger context you shared) are summarised into `rfps.context_summary`, not treated as questions.
4. **Human checkpoint**: user sees the extracted list, merges/splits/deletes, confirms. Status → `questions_ready`. Nothing is drafted before this.

### 6.2 Draft responses (the core loop)
For each confirmed question, as an independent Inngest step:
```
embed(question)
   → retrieve top-8: kb_entries (filtered by module_hint, is_active)
   → retrieve top-5: approved_answers (any module)
   → Claude call with:
        system: Kognoz voice guide + brand rules + rfps.context_summary
        user:   question, retrieved passages (numbered), owner, compliance vocabulary
        output: JSON { compliance, confidence, draft_text, citations:[{n, why}] , open_points:[] }
   → insert responses (ai_draft) + revision v1 + citations
   → progress++
```
Concurrency 5–8; retries per step; a failed question never blocks the batch. Questions owned by `darwinbox` are drafted with capability entries only; `kognoz` ones lean on services/case studies; `joint` use both.

### 6.3 Review & learn
- Edit → new `response_revisions` row (v2, v3…). Regenerate accepts a free-text instruction stored on the revision.
- Approve → status `approved`. If the reviewer ticks **"add to knowledge base"**, an `approved_answers` row is created with a Claude-generalised `canonical_question` (client name stripped) and embedded. This is the flywheel.

### 6.4 CHRO discovery questions
Triggered once ≥ 80% responses are approved (or on demand). Claude Opus receives: client profile, `context_summary`, the approved response set, every response marked `partial`/`not_supported`/`open_points`, and the six-theme framework. Output: 12–16 questions with rationale, one per row in `chro_questions`. Reviewer keeps/drops/edits; kept ones go into the docx/pptx.

### 6.5 Export
`build_export` renders from `brand_templates`: xlsx mirrors the client's original column layout (from `raw_meta`) with our columns appended; docx groups by section with a cover, exec summary (Claude-written from approved content), and the CHRO question appendix; pptx uses the joint value-prop layout.

### 6.6 API surface (route handlers / server actions)
```
POST   /api/rfps                         create
POST   /api/rfps/:id/documents           upload → enqueue parse
POST   /api/rfps/:id/extract             enqueue extract_questions
PATCH  /api/rfps/:id/questions/:qid      edit/merge/split/confirm
POST   /api/rfps/:id/draft               enqueue draft (all or selected ids)
GET    /api/rfps/:id/jobs/:jobId         progress (polled or SSE)
PATCH  /api/responses/:id                edit / approve / flag / promote_to_kb
POST   /api/responses/:id/regenerate     with instruction
POST   /api/rfps/:id/chro                enqueue chro generation
POST   /api/rfps/:id/exports             {format, brand_template_id}
CRUD   /api/kb/entries · /api/kb/sources · /api/kb/approved-answers
```
All inputs validated with zod; all handlers workspace-scoped from the session.

---

## 7. Frontend flow & UX

### 7.1 Screens
| Screen | Purpose | Key UI |
|---|---|---|
| **Dashboard** | Pipeline of RFPs | Table/kanban by status; due-date urgency; % approved bar per RFP |
| **New RFP wizard** | 4 steps: Client → Upload → Extracted questions → Confirm | Drag-drop upload; extraction preview as an editable table with merge/split |
| **RFP Workspace** (the main screen) | Review & approve responses | 3-pane: left = sections + filters (status, owner, compliance, module); centre = question/response grid; right = **context panel** for the selected row |
| **Context panel** | Trust & control | Original question + `raw_meta`; compliance & confidence chips; cited KB passages with similarity; "Regenerate with instruction"; revision history; Approve / Flag / Add-to-KB |
| **CHRO Questions tab** | Curate discovery set | Cards grouped by theme, each with rationale; keep/drop/edit; reorder |
| **Knowledge Base** | Manage the corpus | Tabs: Darwinbox capabilities (by module) · Kognoz services · Approved answers (with reuse counts) · Sources |
| **Exports** | Generate & download | Format + brand template picker; history of files |
| **Settings** | Team, brand, prompts | Roles; brand template editor with live preview; editable voice guide |

### 7.2 UX principles that matter for this tool
- **Grid-first, keyboard-driven.** Reviewers will approve 300 rows; `J/K` to move, `A` approve, `E` edit, `R` regenerate. Bulk-select → bulk approve.
- **Never hide the source.** Original question text and the client's own columns stay visible next to our answer.
- **Show confidence, don't bury it.** Low-confidence and `not_supported` rows sort to the top by default — that's where human time is worth spending.
- **Progress is visible.** Drafting shows a live "142 / 300" bar with per-section completion; the user can leave and come back.
- **Every regenerate is a conversation.** Instruction box on the row ("shorter", "mention SAP migration experience"), and the instruction is saved with the revision.
- **Brand is a setting, not a code change.** Colours, logo, fonts, footer live in `brand_templates` and drive both the app chrome and exports.

### 7.3 State
- Server components for lists; TanStack Query for the workspace grid with optimistic updates; job progress via SSE from `/jobs/:id`.

---

## 8. Trade-offs made explicit
| Decision | Alternative | Why this way |
|---|---|---|
| Jobs via Inngest | Vercel cron + DB polling | Inngest gives per-step retries and resumability for free; polling would need hand-rolled state machines. |
| pgvector in Neon | Pinecone / Atlas Vector | One DB, one query, one bill; volume is tiny. |
| Human checkpoint before drafting | Fully automatic pipeline | Bad extraction poisons every draft; 5 minutes of review here saves hours later. |
| Sonnet for drafts, Opus for CHRO set | Opus everywhere | Drafting is 300 calls; the CHRO set is one call where judgement matters most. |
| Prompt versions stored on revisions | Prompts hard-coded | Lets you A/B voice guides and trace which prompt produced which answer. |

---

## 9. Build phases
| Phase | Scope | Outcome |
|---|---|---|
| **1 — Working model (2–3 wks)** | Auth, clients, RFP upload, xlsx/docx parse, extraction + confirm, draft loop against a seeded Darwinbox capability library, review grid, xlsx export | End-to-end on one real RFP |
| **2 — Learning & CHRO (2 wks)** | Approved-answers flywheel, CHRO question generation, docx + pptx branded exports, brand template editor | Second RFP starts noticeably better |
| **3 — Scale & collaborate** | Darwinbox share-link so their team fills `darwinbox`-owned rows, analytics (coverage by module, reuse rates, win/loss tagging), prompt A/B | Tool becomes the system of record for bids |

**Revisit as it grows:** move embeddings to a dedicated vector index only if the KB passes ~1M chunks; split parsing into a separate service if PDF volumes make cold starts painful; add row-level security if Darwinbox users get direct access.

---

## 10. Immediate next steps
1. Seed `kb_entries` — the Darwinbox module capability library is the single biggest quality lever. Start from Darwinbox docs plus your Axiata/BM/Victura responses.
2. Share the client pointers + your filled response you mentioned; it becomes the first fixture for the extraction and drafting prompts.
3. Scaffold the repo (Next.js + Drizzle + Neon + Inngest) and run the Phase 1 schema migration.
