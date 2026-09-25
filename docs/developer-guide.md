# RFP Studio — Developer Guide & Documentation Standard

This is the rulebook for how RFP Studio is documented, from a single helper function up to the API and the user guide. It is enforced, not aspirational: CI fails on undocumented exports.

---

## 1. Documentation map — what lives where

| Layer | Artifact | Location | Audience | Tool |
|---|---|---|---|---|
| Product | Architecture | `docs/architecture.md` | everyone | markdown |
| Product | User Guide | `docs/user-guide.md` | sales, consultants, reviewers | markdown → rendered in-app at `/help` |
| API | OpenAPI 3.1 spec | `openapi/rfp-studio.yaml` — **source of truth**, published to SwaggerHub | frontend, integrators, Darwinbox | SwaggerHub, Swagger UI at `/api/docs` |
| API | Generated TS client | `packages/api-client/` | frontend | `openapi-typescript` |
| Code | TSDoc on every export | inline | engineers | `typedoc` → `docs/reference/` |
| Data | Schema reference | `docs/data-model.md` (generated from Drizzle) | engineers, analysts | `drizzle-kit` + script |
| Prompts | Prompt registry | `prompts/*.md` with version header | engineers, prompt reviewers | markdown |
| Decisions | ADRs | `docs/adr/NNNN-title.md` | engineers | markdown |
| Ops | Runbooks | `docs/runbooks/*.md` | on-call | markdown |
| Onboarding | README + setup | `README.md`, `docs/onboarding.md` | new engineers | markdown |
| Changes | CHANGELOG | `CHANGELOG.md` | everyone | changesets |

Rule: **link, don't duplicate.** The OpenAPI spec is the only place a request/response shape is written down; the user guide links to it, TSDoc links to it, the frontend client is generated from it.

---

## 2. Repository layout

```
rfp-studio/
├── README.md                     ← quick start (< 5 min to first RFP)
├── CHANGELOG.md
├── openapi/rfp-studio.yaml       ← API source of truth
├── prompts/                      ← versioned prompt files (see §6)
├── docs/                         ← everything in the map above
├── src/
│   ├── app/                      ← Next.js App Router (pages + route handlers)
│   │   ├── (app)/...             ← authenticated UI
│   │   └── api/...               ← thin route handlers: validate → call service → respond
│   ├── server/
│   │   ├── services/             ← domain logic: rfp, question, response, kb, chro, export
│   │   ├── ai/                   ← Claude + embedding clients, retrieval, prompt loading
│   │   ├── jobs/                 ← Inngest functions (parse, extract, draft, chro, export)
│   │   ├── parsers/              ← xlsx / docx / pdf → normalised text + tables
│   │   ├── exporters/            ← xlsx / docx / pptx renderers
│   │   ├── db/                   ← Drizzle schema, migrations, query helpers
│   │   └── auth/
│   ├── components/               ← UI, one folder per feature
│   ├── lib/                      ← shared utils (zod schemas, formatting, errors)
│   └── types/
├── packages/api-client/          ← generated from openapi/
└── tests/
```

---

## 3. Function documentation standard (TSDoc)

**Every exported function, class, type, and React component gets a TSDoc block. No exceptions.** Internal helpers get at least a one-line `/** ... */` if their name doesn't fully explain them.

### 3.1 The template

```ts
/**
 * One-sentence summary in the imperative: what this does.
 *
 * Optional longer paragraph: why it exists, the non-obvious behaviour,
 * the invariant it protects. Write for the engineer who will be paged at
 * 2 a.m. and needs to know if this is the function that broke.
 *
 * @param name - What it is and any constraint (not just the type).
 * @returns What comes back, including the empty / not-found case.
 * @throws {NotFoundError} When the RFP is outside the caller's workspace.
 * @sideEffects Writes `responses` and `response_revisions`; enqueues nothing.
 * @see OpenAPI `operationId: updateResponse`
 * @example
 * const r = await approveResponse(db, { responseId, userId, promoteToKb: true });
 */
```

Required tags by kind:

| Kind | Must have |
|---|---|
| Service function | summary, `@param`, `@returns`, `@throws`, `@sideEffects` (say "none" if pure) |
| Route handler | summary, `@see` the OpenAPI `operationId`, `@auth` (roles allowed) |
| Inngest job | summary, `@trigger` event name, `@steps` list, `@idempotency` note, `@retries` |
| Parser / exporter | summary, `@input` accepted formats, `@output` shape, `@limits` (size, pages) |
| AI call | summary, `@prompt` file + version, `@model`, `@output` JSON schema name |
| React component | summary, `@param props` per prop, `@example` JSX |
| Zod schema | one-line summary; each field gets `.describe()` — this flows into OpenAPI |
| DB table (Drizzle) | one-line comment per table and per non-obvious column |

### 3.2 Worked examples

**Service function**
```ts
/**
 * Approve a response and optionally promote it into the reusable knowledge base.
 *
 * Approval is idempotent: approving an already-approved response returns it
 * unchanged. Promotion generalises the answer (strips client name, replaces
 * client-specific figures with placeholders) via `generaliseAnswer()` before
 * creating an `approved_answers` row, so the same response is never promoted twice.
 *
 * @param db - Drizzle client, already scoped to the caller's workspace.
 * @param input.responseId - Response to approve. Must belong to the workspace.
 * @param input.userId - Approver; must hold `reviewer` or `admin`.
 * @param input.promoteToKb - When true, also create an `approved_answers` row.
 * @returns The response with `status: "approved"` and its revisions.
 * @throws {ForbiddenError} If the user's role cannot approve.
 * @throws {NotFoundError} If the response is not in the workspace.
 * @sideEffects Updates `responses`; may insert `approved_answers` and call the
 *   embedding API; writes one `audit_log` row.
 * @see OpenAPI `operationId: updateResponse`
 */
export async function approveResponse(db: Db, input: ApproveResponseInput): Promise<ResponseDetail>
```

**Inngest job**
```ts
/**
 * Draft AI responses for every confirmed question in an RFP.
 *
 * Fans out one durable step per question so a single failure never aborts the
 * batch. Progress is written to `generation_jobs` after each step so the UI
 * can show "142 / 300".
 *
 * @trigger `rfp/draft.requested` { rfpId, questionIds?, force?, instruction? }
 * @steps load-questions → (per question) embed → retrieve → draft → persist → progress
 * @idempotency Skips questions that already have an `approved` response unless `force`.
 * @retries 3 per step, exponential backoff; the job is marked `failed` only if
 *   more than 10% of steps exhaust retries.
 * @concurrency 6 (bounded by Anthropic rate limit tier).
 */
export const draftResponsesJob = inngest.createFunction(...)
```

**Route handler**
```ts
/**
 * POST /api/rfps/{rfpId}/draft — enqueue drafting for an RFP.
 *
 * Thin wrapper: validates body with `DraftRequestSchema`, checks the RFP is in
 * `questions_ready` or later, sends the Inngest event, returns 202 with the job.
 *
 * @auth consultant, admin
 * @see OpenAPI `operationId: draftResponses`
 */
export async function POST(req: Request, { params }: { params: { rfpId: string } })
```

**AI call**
```ts
/**
 * Ask Claude to draft one response from retrieved context.
 *
 * @prompt prompts/draft-response.md@v3
 * @model claude-sonnet (bulk); switched to opus when `question.isMandatory && retrieved.length === 0`
 * @output `DraftOutputSchema` — { compliance, confidence, draftText, citations[], openPoints[] }
 * @returns Parsed and validated output; never raw text.
 * @throws {AiOutputError} If the JSON fails schema validation after one repair attempt.
 */
export async function draftOne(ctx: DraftContext): Promise<DraftOutput>
```

**Zod schema (feeds OpenAPI)**
```ts
/** Body for PATCH /responses/{id}. */
export const ResponsePatchSchema = z.object({
  finalText: z.string().min(1).optional().describe("Replaces the current text; creates a new revision."),
  compliance: ComplianceEnum.optional().describe("Override the model's compliance rating."),
  status: z.enum(["edited", "approved", "flagged"]).optional().describe("approved requires reviewer/admin."),
  promoteToKb: z.boolean().optional().describe("On approval, add to approved_answers."),
});
```

**React component**
```tsx
/**
 * Three-pane RFP review workspace: section nav, question/response grid, context panel.
 *
 * Owns keyboard navigation (J/K/A/E/R) and optimistic status updates; all data
 * access goes through `useRfpQuestions(rfpId)`.
 *
 * @param props.rfpId - RFP to display.
 * @param props.initialFilter - Optional filter applied on first render (e.g. from a dashboard link).
 * @example <RfpWorkspace rfpId={id} initialFilter={{ responseStatus: "flagged" }} />
 */
export function RfpWorkspace(props: RfpWorkspaceProps)
```

### 3.3 Enforcement
- ESLint: `eslint-plugin-jsdoc` with `require-jsdoc` on all exports, `require-param`, `require-returns`, `require-description`.
- `typedoc --treatWarningsAsErrors` in CI generates `docs/reference/`; undocumented exports fail the build.
- PR template has a checkbox: "Every new/changed export has a TSDoc block; OpenAPI updated if a route changed."

---

## 4. API documentation workflow

1. **Change the spec first** (`openapi/rfp-studio.yaml`), then implement. The spec is reviewed like code.
2. `pnpm api:lint` — Redocly lint (must be error-free).
3. `pnpm api:client` — regenerates `packages/api-client` types.
4. `pnpm api:publish` — pushes to SwaggerHub (org `Kognoz`, API `rfp-studio`), bumping `info.version`.
5. Route handlers validate with the same zod schemas that generate the spec (`zod-to-openapi`), so drift is caught by a contract test: `tests/contract/openapi.spec.ts` asserts every route handler has a matching `operationId`.

Swagger UI is served at `/api/docs` in dev and to admins in prod.

---

## 5. Data model documentation

- Every Drizzle table and non-obvious column carries a comment (`.$comment()` / JSDoc above the column).
- `pnpm docs:data-model` renders `docs/data-model.md`: one section per table with columns, types, constraints, indexes, and an ER diagram (Mermaid `erDiagram`) generated from the foreign keys.
- Migrations are named `NNNN_verb_object.sql` and carry a header comment: what changed, why, whether it's backward compatible, and how to roll back.

---

## 6. Prompt documentation

Prompts are code. Each file in `prompts/` has a header:

```md
---
name: draft-response
version: 3
model: claude-sonnet
output_schema: DraftOutputSchema
changed: 2026-09-15 — added compliance vocabulary; forced citations to reference retrieved passage numbers
evaluated_on: eval/draft-response.jsonl (42 cases) — pass 39/42
---
```

The `version` is stored on every `response_revisions.prompt_version`, so any answer can be traced to the exact prompt that produced it. Changing a prompt without bumping the version fails CI.

---

## 7. ADRs (Architecture Decision Records)

`docs/adr/NNNN-title.md`, one per decision that a future engineer might question:

```md
# 0003 — Use Neon Postgres + pgvector instead of MongoDB
Status: Accepted · Date: 2026-09-15
## Context
## Decision
## Consequences (good, bad, neutral)
## Alternatives considered
```

Seed set: 0001 Next.js on Vercel · 0002 Inngest for jobs · 0003 Postgres over Mongo · 0004 Human checkpoint before drafting · 0005 Sonnet for drafts, Opus for CHRO set · 0006 Prompt versioning on revisions.

---

## 8. Runbooks

`docs/runbooks/` — each follows: **When to use · Access needed · Steps · Rollback · Escalate to**.

| Runbook | Trigger |
|---|---|
| `draft-job-stuck.md` | Job shows `running` with no progress for > 10 min |
| `anthropic-rate-limited.md` | 429s in Sentry; lower Inngest concurrency, resume |
| `parse-failed.md` | Document `parseStatus: failed` — how to inspect the file, common fixes (password-protected pdf, merged xlsx cells) |
| `bad-extraction.md` | Questions come out garbled — re-run with `chunking=rows` |
| `export-failed.md` | Template asset missing / font not embedded |
| `restore-deleted-rfp.md` | Soft-delete recovery within 30 days |
| `rotate-secrets.md` | Anthropic key, Neon connection string, storage credential (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) |
| `neon-branch-for-debug.md` | Create a DB branch from prod to reproduce a data bug safely |

---

## 9. README quick start (what the top-level README must contain)

```bash
git clone … && cd rfp-studio
pnpm install
cp .env.example .env.local      # fill: DATABASE_URL, ANTHROPIC_API_KEY, VOYAGE_API_KEY,
                                #       AWS_* + STORAGE_BUCKET, AUTH_GOOGLE_ID/SECRET, INNGEST_*
pnpm db:migrate && pnpm db:seed # seeds a demo client, one RFP, and 40 Darwinbox capability entries
pnpm dev                        # app on :3000, Inngest dev server on :8288
```
Then: sign in → New RFP → upload `fixtures/sample-rfp.xlsx` → Extract → Confirm → Draft. Under five minutes.

Also in the README: environment variable table (name, required?, where to get it), scripts table, how to run tests, how to publish the API spec, link to the user guide and to this document.

---

## 10. Testing documentation

- Unit tests sit next to the code (`*.test.ts`) and are named as sentences: `it("skips already-approved responses unless force is set")`.
- `tests/contract/` — OpenAPI ↔ route handler contract.
- `eval/` — prompt evaluation sets (`*.jsonl`) with a README explaining scoring; results are logged in the prompt header (§6).
- Every bug fix adds a test whose name references the issue.

---

## 11. Definition of "documented" for a PR

A PR is mergeable only if:
1. Every new/changed export has a complete TSDoc block (§3).
2. Any route change is reflected in `openapi/` and the client is regenerated (§4).
3. Any schema change updates `docs/data-model.md` and the migration header (§5).
4. Any prompt change bumps the version and records the eval result (§6).
5. Any user-visible change updates `docs/user-guide.md` and `CHANGELOG.md`.
6. A non-obvious technical choice gets an ADR (§7).
