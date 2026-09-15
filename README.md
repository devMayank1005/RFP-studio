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
   way. Without them a production build sends nothing: uploads sit at "queued" forever.
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
src/engine/      Claude calls (structured outputs) + Voyage embeddings
prompts/         versioned system prompts and the default voice guide
src/inngest/     parse-document → extract-questions → draft-responses (durable per-question steps)
src/app/actions/ server actions: rfps, documents, questions, responses, review
src/db/          Drizzle schema, queries, jobs, audit, seed
src/components/  shell, chips, dashboard, wizard, workspace
```

Flow: **New RFP** (client) → **Upload** (private Blob, parse job) → **Questions** (extraction job:
column roles, per-chunk classification, sections, context brief) → **Confirm** (optionally import a
vendor's earlier answers) → **Workspace** (draft with Claude, review with J/K/A, regenerate with an
instruction, every revision and citation kept).

## Scripts

```
pnpm dev · build · lint · typecheck · test · test:e2e
pnpm db:generate · db:migrate · db:push · db:studio · db:seed · db:ping · db:check-auth
pnpm kb:seed                                    embed KB entries / approved answers missing a vector
pnpm kb:ingest <file>                           (milestone 2) PDF/DOCX → KB entries
pnpm exec tsx scripts/extract-one.ts <file>     run extraction on a file and print what it found
pnpm exec tsx scripts/simulate-upload.ts <rfpId> <file> [kind]   attach a file without the browser
pnpm exec tsx scripts/make-fixtures.ts          regenerate the synthetic fixtures
```

Real client RFPs go in `fixtures/private/` (git-ignored). `fixtures/public/` holds synthetic ones.
