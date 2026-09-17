# RFP Studio

Kognoz Consulting's internal tool for answering client RFPs with Darwinbox: upload the RFP,
let Claude extract the questions, draft answers from the Kognoz/Darwinbox knowledge base, and
review them in a keyboard-driven grid.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 + shadcn/ui · TanStack Query/Virtual ·
Neon Postgres + pgvector via Drizzle · Better Auth (Microsoft Entra SSO) · Inngest · Anthropic SDK
(Claude Sonnet 5 / Opus 5) · Voyage AI embeddings · Vercel Blob.

## Run it locally

```bash
pnpm install
cp .env.example .env.local          # then fill it in — see "Environment"
vercel link && vercel env pull .env.local --yes   # DATABASE_URL, BLOB token, etc. from the Vercel project
pnpm db:migrate && pnpm db:seed     # schema, workspace, brand template, clients, KB entries, demo RFP
pnpm kb:seed                        # embeds the knowledge base (needs VOYAGE_API_KEY)
pnpm dev --port 3001                # 3000 is usually taken by Social Studio on this machine
pnpm inngest:dev                    # second terminal: local job runner (no account needed)
```

Sign in with a `kognozconsulting.com` Microsoft account. The first person in becomes admin;
everyone after is a consultant until an admin changes it (Settings, milestone 2).

## Environment

Every variable is read through `src/lib/env.ts` (`readEnv` / `readSecret`) — never `process.env`
directly (an eslint rule enforces it). Secrets keep only their first line, so a pasted trailing
comment cannot poison an HTTP header.

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon (Vercel Marketplace). Pooled for the app, direct for migrations. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (private store `rfp-studio-uploads`). |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Session signing; the site origin. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Entra app registration. Tenant GUID locks sign-in to the Kognoz directory. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated. Excludes tenant guests. |
| `ANTHROPIC_API_KEY` | Extraction, drafting, briefs. |
| `VOYAGE_API_KEY` | Embeddings (`voyage-4`, 1024-d). |
| `INNGEST_DEV` | `1` locally: events go to the local dev server. |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Production only. |

**Entra redirect URI** to register: `{BETTER_AUTH_URL}/api/auth/callback/microsoft` — the full
path, not the site root. Keep `http://localhost:3001/api/auth/callback/microsoft` for development.

## Deploying

The build needs no secrets. Neon and Blob variables come from the integrations; the auth instance
is constructed on first use rather than at import, and the Claude and Voyage keys are read without
throwing — `next build` evaluates every route module while collecting page data, and the first
Vercel build died on the allowlist check for exactly that reason. A deployment without the SSO variables therefore builds
and serves the sign-in page; the Microsoft button answers 500, with the missing variable named in
the function log, until step 1 is done.

1. Create a fresh Entra app registration for production (redirect URI above — never reuse the
   development registration), then set the variables in Vercel. Production scope; add Preview too
   if preview deployments should sign in.

   ```bash
   for v in BETTER_AUTH_SECRET BETTER_AUTH_URL MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET \
            MICROSOFT_TENANT_ID ALLOWED_EMAIL_DOMAINS ANTHROPIC_API_KEY VOYAGE_API_KEY; do
     vercel env add "$v" production
   done
   ```

   `BETTER_AUTH_SECRET` is `openssl rand -base64 32`; `BETTER_AUTH_URL` is the production origin
   with no trailing slash; `MICROSOFT_TENANT_ID` is the Kognoz tenant GUID.
2. Create an Inngest app (inngest.com), add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` the same
   way. Without them a production build cannot send jobs: uploads, extraction, drafting, CHRO generation and
   KB ingest refuse up front with the variable named. A document whose job was never picked up shows
   "Not picked up" on the upload step with a Retry.
3. Run `pnpm db:migrate` against the production `DATABASE_URL_UNPOOLED`, then `db:seed` and `kb:seed`
   (the KB seed needs `VOYAGE_API_KEY` in the shell to embed).
4. Deploy: `vercel deploy --prod`. A plain `vercel deploy --target=preview` makes a preview first;
   `vercel inspect <url>` shows the target either way.
5. Sync the functions: `curl -X PUT https://<host>/api/inngest` → `{"message":"Successfully registered"}`.
   Success also proves the signing key is right.

Functions are pinned to `bom1` (Mumbai) in `vercel.json`; the database is in Singapore (`sin1`),
the closest Neon marketplace region.

## How it fits together

```
src/domain/      pure rules: enums, extraction mapping, drafting prompt assembly, triage order (tested)
src/lib/parsing/ xlsx / pdf / docx → ParsedDocument
src/lib/export/  ExcelJS and docx renderers for the Excel (fresh or filled-in) and Word exports
src/engine/      Claude calls (structured outputs) + Voyage embeddings
prompts/         versioned system prompts and the default voice guide
src/inngest/     parse-document → extract-questions → draft-responses (durable per-question steps), build-export
src/app/actions/ server actions: rfps, documents, questions, responses, review
src/db/          Drizzle schema, queries, jobs, audit, seed
src/components/  shell, chips, dashboard, wizard, workspace, kb (knowledge-base screen), exports
```

Flow: **New RFP** (client) → **Upload** (private Blob, parse job) → **Questions** (extraction job:
column roles, per-chunk classification, sections, context brief) → **Confirm** (optionally import a
vendor's earlier answers) → **Workspace** (draft with Claude, review with J/K/A, regenerate with an
instruction, every revision and citation kept; **Add to KB** turns an approved answer into a reusable,
client-neutral passage future drafts retrieve).

**CHRO questions** (`/rfps/[id]/chro`): once most answers are approved (80 % is the guide, not a gate), Opus
proposes 12–16 discovery questions across six themes from the approved answers and the gaps (partial,
not supported, open points). Reviewers keep, drop, edit and reorder them (`J/K`, `A`, `X`, `E`, `⌥↑↓`) or add
their own; kept questions survive regeneration. `pnpm exec tsx scripts/chro-preview.ts <rfpId>` prints a set
without writing, for prompt tuning.

**Settings** (`/settings`): team roles (admins only; the last admin cannot be demoted), the brand template
with a live preview (colours drive the chrome through `<BrandStyle/>`; chip tints stay fixed for contrast;
dark mode keeps its own primary), and the voice guide that opens every draft's system prompt.

**Knowledge base** (`/kb`): four tabs — Darwinbox capabilities by module, Kognoz services, approved answers
with reuse counts, and sources. Entries are edited in a side sheet (`N` new, `J/K` move, `Enter` open, `/` search)
and re-embedded when their text changes; they are deactivated rather than deleted so past citations still
resolve. "Ingest a document" uploads a PDF/DOCX to private Blob and runs the `ingest-kb-source` Inngest job,
whose progress lives on the `kb_sources` row (migration 0003).

**Quick Q&A** (`/quick`): the short path. Paste questions (or drop a client's questionnaire), add deal context,
pick a client or none, and press **Extract questions**. A `quick-intake` job turns the paste or file into questions
(the same extractor as the wizard, with a line-split fallback for bare lists) and stops there: the session page lists
them and you choose — **Draft all responses**, or **Draft this question** one card at a time — and a wrong extraction
can be **removed** before any model call is spent. Drafting is the ordinary draft job; cards fill in as answers land,
each with its sources and open points. Edit, regenerate with an instruction, approve, or **Add to knowledge base** in
one click (approve + promote). A session
is an RFP with `kind = quick` (migration 0005): it stays off the pipeline, opens on `/quick/[id]` from ⌘K, and has
"Open in workspace" for the full grid. Sessions without a client file under a per-workspace "Quick Q&A" client.

**Exports** (`/rfps/[id]/exports`): the files that go to the client. **Excel** either as a fresh workbook —
the client's own columns in their original order, then Compliance, Response, Status, Owner, Open points and
Sources — or as the client's uploaded questionnaire *filled in*: every question is matched back to its row
(by text, so merged and split questions still land; whatever cannot be matched is listed on a final "Kognoz
notes" sheet) and our answer, compliance and remarks go into their own Solution / Feasibility / Remarks
columns, appended when they have none. **Word**: cover, an executive summary Claude writes from the approved
answers, an overview table, every section with its questions, answers, sources and open points, and the kept
CHRO questions as an appendix — colours, font, logo and footer from the brand template. Every question is
exported with its current answer; unapproved ones are marked (a Status column, or an amber cell with a note)
and the page says how many there are before you build; tick "Only approved answers" to leave the rest blank.
Builds run as the `build-export` Inngest job, land in private Blob and download through a session-gated route;
the history keeps every file with who built it. The deck is a later milestone.

Opt-in end-to-end cases: `E2E_WITH_MODEL=1` runs the cases that call Claude (a Word export, a Quick Q&A
session drafted to the end); `E2E_FILL_RFP_ID=<rfp id>` runs the filled-workbook export against an RFP whose
original .xlsx questionnaire is parsed. Both need `pnpm inngest:dev` alongside `pnpm dev --port 3001`.

## Tenancy, idempotency and the dashboard

**Every query filters on `workspaceId`; Postgres checks it a second time.** Migration 0006 enables
row-level security on the tenant tables (`rfps`, `rfp_questions`, `clients`, `brand_templates`, `audit_log`,
`kb_sources`, `kb_entries`, `approved_answers`) with one `<table>_tenant` policy each: rows whose `workspace_id`
differs from the transaction's `app.org_id` are invisible, and a write for another workspace is rejected. The
policy is "enforce when set": outside `withOrg` nothing changes, so code that has not moved under it behaves
exactly as before. `withOrg(workspaceId, tx => …)` in `src/db/client.ts` opens a transaction, switches to the
`rfp_tenant` role (migration 0007 — the connecting role owns the tables and, on Neon, bypasses RLS, so a plain
role with the same grants is what makes the policies bite) and sets `app.org_id`; both are `SET LOCAL`, so nothing
leaks to the next request on the pooled connection. The API routes (`/api/search`, `/api/jobs/…`, the workspace and
question-detail feeds, export download) and the job-side reads in the Inngest functions run under it; the read
queries take an optional executor so the same function works on the pool or inside the transaction. Rules:
a new tenant table gets a policy in its migration; a new externally reachable reader goes under `withOrg`;
`pnpm db:rls-check` proves a foreign org sees zero rows and prints role diagnostics when it does not.

**One live job per action.** `generation_jobs.dedupe_key` plus a partial unique index on
`(rfp_id, dedupe_key)` over queued/running rows means `createJob` returns `null` instead of a second job when the
same thing is already in flight (`parse:<documentId>`, `extract`, `draft:all`, `draft:q:<questionId>`, `chro`,
`export:<format>`, `quick`); the action turns that into "already running". Every Inngest function declares
`idempotency: "event.data.jobId"`, so a re-delivered event never starts a second run, and its concurrency is keyed
by `event.data.workspaceId` (per-tenant limit plus a global one) so one workspace cannot starve another. Inserts
that could race (`responses` per question, `approved_answers` per origin response) use `onConflictDoNothing` on a
unique index rather than a read-then-write check.

**Search is index-backed.** `pg_trgm` GIN indexes on `rfps.title`, `clients.name`, `rfp_questions.question_text`
and `ref_no` make the ⌘K `ILIKE '%…%'` queries index scans; `rfp_questions.workspace_id` is a real column with an
index, so questions are searched without going through `rfps`.

**Dashboard counts are stored, not aggregated.** `rfps.question_count / drafted_count / approved_count /
flagged_count` are maintained by Postgres triggers on `rfp_questions` and `responses` (`rfp_counts_refresh`), so
the dashboard and RFP headers read four integers instead of joining every question and response in the
workspace. `pnpm db:counts-check` recomputes and compares; if a raw-SQL write ever bypasses the triggers,
`select rfp_counts_refresh(id) from rfps` repairs them.

## Operations

**Errors.** There is no error vendor. `reportError` (`src/lib/report.ts`) writes one redacted JSON line per
error, and Next's `onRequestError` hook (`src/instrumentation.ts`) reports every server-side throw with the
route that produced it; `runAction` reports any non-`ActionError` before rethrowing, and every job's
`onFailure` goes through `failJob`, which stores a redacted, capped reason on the job row and reports the
original. In Vercel → Project → Logs, filter on `level:error`; the `where` field says which part of the app
(`request`, `action`, `job:draft`, `sweep`), and the `digest` matches what the user sees on the error page.
The root boundary is `src/app/global-error.tsx`; the signed-in one is `src/app/(app)/error.tsx`.

**Rate limits.** Fixed windows per user in Postgres (`rate_limits`, one upsert per limited call — an in-memory
counter would be per instance on Fluid compute). Policy in `src/domain/rate-limit.ts`:

| Scope | Where | Limit |
|---|---|---|
| `model:user` | actions that call Claude or Voyage inline: save/update a KB entry, Add to KB, approve-and-promote | 30 / min |
| `jobs:user` | every action that enqueues a job: upload, extract, draft, regenerate, CHRO, export, Quick Q&A, KB ingest | 20 / min |
| `api:session` | the polled JSON routes (search, jobs, workspace, question detail, export download) | 300 / min |

Over the limit an action returns "Slow down — try again in N s." and a route answers 429 with `Retry-After`.
Better Auth's own limiter runs against the database too (`rateLimit` table): 10 sign-ins a minute per IP.

**Sweeper.** The `sweep` Inngest function runs every 10 minutes (`src/inngest/sweep.ts`, rules in
`src/domain/sweep.ts`): a job still `queued` after 5 minutes or `running` after 30 is marked failed with a
reason (and its export, document or KB source row with it); files in Blob storage whose RFP is gone are
deleted at once, and unreferenced files of live RFPs or KB sources after a day; rate-limit rows older than an
hour are dropped. `pnpm sweep:preview` prints what the next run would do without doing it.

**Fixture accounts.** `scripts/dev-session.mjs` creates `dev.<role>@rfp-studio.invalid` users for local
verification and the e2e suite, and production shares the database. They cannot sign in, and Settings → Team
hides them from real people (`visibleMembers` in `src/domain/access.ts`); only a fixture session sees them.

**Secrets.** `pnpm lint` (so every Vercel build) runs `scripts/secrets-check.mjs`: no env file other than
`.env.example` may be tracked, and no tracked line may look like an Anthropic, Inngest, Vercel Blob or Neon
credential or a password inside a connection string. Every new variable goes into `.env.example` with a
placeholder, and `/api/inngest` refuses to serve (503) in production until both Inngest keys are set.

## Scripts

```
pnpm dev · build · lint · typecheck · test · test:e2e
pnpm db:generate · db:migrate · db:push · db:studio · db:seed · db:ping · db:check-auth
pnpm db:rls-check · db:counts-check              prove row-level security bites / dashboard counters match a recount
pnpm secrets:check · sweep:preview               refuse credential-shaped tracked text / show what the sweeper would reap and delete
pnpm kb:seed                                    embed KB entries / approved answers missing a vector
pnpm kb:ingest <file> [--dry-run]               PDF/DOCX product doc → KB entries (same as the Sources tab's "Ingest a document")
pnpm exec tsx scripts/extract-one.ts <file>     run extraction on a file and print what it found
pnpm exec tsx scripts/simulate-upload.ts <rfpId> <file> [kind]   attach a file without the browser
pnpm exec tsx scripts/make-fixtures.ts          regenerate the synthetic fixtures
```

Real client RFPs go in `fixtures/private/` (git-ignored). `fixtures/public/` holds synthetic ones.
