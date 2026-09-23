# API status — the OpenAPI contract against what is live

`public/openapi.yaml` (rendered at **/docs/api**) is the design contract for RFP Studio's HTTP
surface: 33 operations, 36 schemas, RFC 9457 errors. The app today exposes a small set of route
handlers and does everything else through Next.js **server actions** (`src/app/actions/*.ts`),
which are typed, session-checked calls from the UI rather than public REST endpoints. This table
says, per spec path, whether an HTTP endpoint exists, which server action does the job, or that
it is planned. Adding the REST endpoint is a thin wrapper over the named action when needed.

| Spec path | Status | Today |
|---|---|---|
| `/auth/me` | via Better Auth | `GET /api/auth/get-session` (Better Auth); app code uses `requireSession()` |
| `/clients`, `/clients/{clientId}` | planned | Clients are created inside the New RFP form (`createDraftRfp`) |
| `/rfps` | action | `createDraftRfp`; list = Dashboard page loader |
| `/rfps/{rfpId}` | action | RFP header/page loaders; status changes happen through the workflow actions |
| `/rfps/{rfpId}/documents` | action | `uploadDocuments`, `deleteDocument`, `retryParse` |
| `/rfps/{rfpId}/documents/{documentId}` | action | `deleteDocument` |
| `/rfps/{rfpId}/extract` | action | `startExtraction` → Inngest `rfp/extract.requested` |
| `/rfps/{rfpId}/questions` | action | `updateQuestion`, `deleteQuestions`, `createSection`; list = setup page loader and `GET /api/rfps/{rfpId}/workspace` |
| `/rfps/{rfpId}/questions/confirm` | action | `confirmQuestions` |
| `/rfps/{rfpId}/questions/{questionId}` | **live (GET)** + action | `GET /api/rfps/{rfpId}/questions/{questionId}` (detail with revisions and citations); edits via `updateQuestion` |
| `/rfps/{rfpId}/questions/{questionId}/split` | action | `splitQuestion` |
| `/rfps/{rfpId}/questions/merge` | action | `mergeQuestions` |
| `/rfps/{rfpId}/draft` | action | `draftRfp` → Inngest `rfp/draft.requested` |
| `/responses/{responseId}` | action | `editResponse`, `setCompliance`, `flagResponse` |
| `/responses/{responseId}/regenerate` | action | `regenerateResponse` |
| `/responses/bulk` | action | `approveResponses`, `unapproveResponses` |
| `/rfps/{rfpId}/chro`, `/rfps/{rfpId}/chro/{chroQuestionId}` | action | `requestChroQuestions`, `setChroStatus`, `editChroQuestion`, `moveChroQuestion`, `addChroQuestion` |
| `/kb/entries`, `/kb/entries/{entryId}` | action | `saveKbEntry`, `setKbEntryActive`; list = KB page loader |
| `/kb/sources` | action | `ingestKbDocument`, `reingestKbSource`; CLI `pnpm kb:ingest` |
| `/kb/approved-answers`, `/kb/approved-answers/{answerId}` | action | `promoteToKb`, `updateApprovedAnswer`, `deleteApprovedAnswer` |
| `/jobs/{jobId}` | **live** | `GET /api/jobs/{jobId}` (polled by the UI every 1.5 s) |
| `/jobs/{jobId}/events` | planned | Progress is polled, not streamed |
| `/jobs/{jobId}/cancel` | planned | The sweeper retires stale jobs; no user cancel yet |
| `/rfps/{rfpId}/exports` | action | `requestExport`, `deleteExport` |
| `/exports/{exportId}/download` | **live** | `GET /api/rfps/{rfpId}/exports/{exportId}/download` (nested under the RFP for the workspace check) |
| `/brand-templates`, `/brand-templates/{templateId}` | action | `saveBrand`, `saveVoiceGuide` (one active template per workspace) |
| `/users`, `/users/{userId}` | action | `setMemberRole`; membership is granted just in time at sign-in |

Not in the spec but live: `GET /api/rfps/{rfpId}/workspace` (the review grid's rows), `GET /api/search` (⌘K),
`/api/inngest` (job runner), `/api/auth/*` (Better Auth). Quick Q&A (`createQuickSession`,
`retryQuickIntake`, `draftQuestion`, `approveAndPromote`, `removeQuickQuestion`) post-dates the spec.
