# RFP Studio — User Guide

*For the Kognoz sales and consulting team. Rendered in-app at `/help`; this file is the source.*

---

## Contents
1. What RFP Studio does
2. Roles and what you can do
3. Signing in
4. The Dashboard
5. Creating an RFP (New RFP wizard)
6. Reviewing extracted questions
7. Drafting responses
8. The RFP Workspace — reviewing and approving
9. Regenerating an answer
10. Flagging and assigning
11. CHRO discovery questions
12. Exporting the proposal
13. The Knowledge Base
14. Brand templates
15. Managing users
16. Keyboard shortcuts
17. Statuses explained
18. Troubleshooting
19. FAQ
20. Glossary

---

## 1. What RFP Studio does

RFP Studio turns a client's RFP into a first-draft proposal in minutes instead of days:

1. You upload the RFP files the client sent.
2. It extracts every question or requirement into a clean list, which you confirm.
3. It drafts a humanised, client-specific answer for each line, grounded in what Darwinbox can actually do and what Kognoz offers — and shows you exactly which knowledge it used.
4. You review, edit, and approve. Approved answers can be saved to the knowledge base so the next RFP starts stronger.
5. It proposes CHRO-level discovery questions based on the client's context and the gaps it found.
6. You export a branded compliance matrix (Excel), narrative proposal (Word), or value-proposition deck (PowerPoint).

**What it does not do:** it never sends anything to a client, never changes an answer after you approve it, and never drafts before you confirm the question list.

---

## 2. Roles and what you can do

| | Sales | Consultant | Reviewer | Admin |
|---|---|---|---|---|
| View RFPs, questions, responses | ✓ | ✓ | ✓ | ✓ |
| Create RFP, upload files | ✓ | ✓ | | ✓ |
| Edit / confirm questions | | ✓ | | ✓ |
| Run drafting, edit responses, regenerate | | ✓ | ✓ | ✓ |
| Approve / flag responses, add to KB | | | ✓ | ✓ |
| Curate CHRO questions | | ✓ | ✓ | ✓ |
| Export | ✓ | ✓ | ✓ | ✓ |
| Manage Knowledge Base | | ✓ | ✓ | ✓ |
| Brand templates, users, mark Won/Lost | | | | ✓ |

Your role is shown under your name in the top-right menu. Ask an admin to change it.

---

## 3. Signing in

Go to the RFP Studio URL and click **Sign in with Google**. Use your Kognoz Google Workspace account — personal Gmail accounts are rejected. There are no passwords to manage. If you see "Not a member of this workspace", ask an admin to invite you (§15).

---

## 4. The Dashboard

The first screen after sign-in. It shows every RFP in the pipeline.

- **Cards / table toggle** (top-right) — kanban columns by status, or a sortable table.
- **Each RFP shows:** client, title, due date (red when under 3 days), status, and a progress bar: *questions → drafted → approved*.
- **Filters:** status, client, owner (mine / all), due this week.
- **Search:** client or RFP title.
- **New RFP** button (top-right) starts the wizard (§5).

Click any RFP to open its Workspace (§8).

---

## 5. Creating an RFP (New RFP wizard)

**Step 1 — Client.** Pick an existing client or create one. Fill what you know: industry, HQ country, number of countries, headcount, current HRMS (e.g. SAP SuccessFactors, ZingHR). This context is used in every draft, so more is better.

**Step 2 — RFP details.** Title, engagement type (HRIS implementation / advisory / joint bid / managed services), bidder of record (Kognoz / Darwinbox / joint), due date.

**Step 3 — Upload files.** Drag in everything the client sent. Tag each file:
- **RFP main** — the questionnaire or requirements document
- **Appendix** — bidder profile sheets, scope annexes
- **Client pointers** — emails, briefing notes, "what we understood" documents (used for context, not extracted as questions)
- **Our prior response** — if you're updating a previous submission
- **Other**

Supported: xlsx, docx, pdf, csv, txt, md. Up to 25 MB each. Parsing starts immediately; a spinner shows per file.

**Step 4 — Extract questions.** Click **Extract**. Depending on size this takes 30 seconds to a few minutes. You'll land on the question review screen (§6).

---

## 6. Reviewing extracted questions

This is the most important five minutes in the whole process. Bad extraction means bad drafts.

You see a table: **Section · Ref no · Question · Type · Mandatory · Owner · Module**.

Check for:
- **Merged questions** — two requirements in one row. Select the row → **Split** → paste each part on its own line.
- **Fragmented questions** — one requirement split across rows. Select the rows → **Merge**.
- **Non-questions** — headings or instructions picked up as questions. **Delete** them.
- **Missing questions** — click **Add question** and type it in.
- **Owner** — who answers this: *Kognoz*, *Darwinbox*, *Joint*, or *N/A*. The extractor guesses; correct it. This decides which knowledge the drafter uses.
- **Module** — the Darwinbox module it relates to (Core HR, Payroll, Recruiting, Performance, Learning, …) or *Advisory*. Also a guess; correct it.

When it looks right, click **Confirm questions**. The RFP moves to *Questions ready*. You can still edit individual questions later, but re-running extraction won't overwrite confirmed ones.

---

## 7. Drafting responses

From the Workspace, click **Draft all** (or select rows and **Draft selected**).

Optional: add a **global instruction** that applies to every answer in this run — e.g. "Keep answers under 80 words" or "Refer to the client as 'the Group' throughout".

A progress bar appears: *142 / 300*. You can navigate away; drafting continues in the background and the bar is on the dashboard card too. Each answer appears in the grid as soon as it is ready.

For each question the tool: finds the most relevant Darwinbox capabilities, Kognoz services, and previously approved answers → writes a draft → rates compliance and confidence → records which sources it used.

Questions that already have an approved answer are skipped unless you tick **Force re-draft**.

---

## 8. The RFP Workspace — reviewing and approving

Three panes:

**Left — Sections & filters.** Jump between sections; filter by status (draft / edited / approved / flagged), owner, compliance, module. **"Needs attention"** is a preset that shows low-confidence and not-supported rows first — start there.

**Centre — The grid.** One row per question:
- Ref no · Question · Answer (first lines) · Compliance chip · Confidence · Status · Assignee
- Colour of the confidence dot: green ≥ 0.8, amber 0.5–0.8, red < 0.5.
- Click a row to open it in the right pane; double-click the answer to edit inline.

**Right — Context panel** for the selected row:
- **Original question** exactly as the client wrote it, plus any extra columns from their spreadsheet.
- **Answer editor** — rich text; edits save automatically and create a new revision.
- **Compliance** — change the rating if the model got it wrong: *Fully · Partial · Via customization · Via partner · Not supported · N/A*.
- **Sources used** — the knowledge-base passages the draft was based on, with a relevance score. Click to read the full entry.
- **Open points** — things the model could not resolve. These feed the CHRO questions.
- **Revision history** — every version, who made it, and (for AI versions) the instruction used.
- **Actions:** Approve · Flag · Assign · Regenerate · Add to Knowledge Base.

**Approving.** Reviewers and admins click **Approve** (or press `A`). The row locks its text; anyone can still add comments in *Flag*. Tick **Add to Knowledge Base** when the answer is good enough to reuse on future RFPs — the tool strips the client name and stores a general version.

**Bulk actions.** Tick several rows → Approve / Flag / Assign at once.

When every mandatory question is approved, the RFP status becomes *Approved* and export is unlocked without warnings.

---

## 9. Regenerating an answer

Open the row → **Regenerate** → type an instruction:
- "Shorter — two sentences."
- "More formal; this is a listed company."
- "Mention our SAP SuccessFactors migration experience at Axiata."
- "Answer as *partial* and explain the workaround."

A new revision appears in 5–15 seconds. The previous versions stay in history; click any of them → **Restore** to go back.

---

## 10. Flagging and assigning

**Flag** a row when it needs someone else's input — add a reason ("Need Darwinbox to confirm payroll for Indonesia"). Flagged rows show a red marker and appear in the *Flagged* filter and on the dashboard counter.

**Assign** a row to a colleague; they see it under *Mine* on the dashboard.

---

## 11. CHRO discovery questions

Once most answers are approved (the tab lights up at 80%), open the **CHRO Questions** tab and click **Generate**.

The tool reads the client's context, your approved answers, and every partial / not-supported / open point, and proposes 12–16 questions in six themes:

| Theme | What it probes |
|---|---|
| Group mandate & vision | What HR must deliver; how success is defined |
| Scope & entity structure | Which entities, maturity differences, pilot vs. cluster |
| Operating model | Shared services, outsourcing philosophy |
| Technology & AI | One platform vs. federated; appetite for AI |
| Prioritization | Sequence by entity or by pillar; 12-month wins |
| Governance & culture | Reporting lines, who else must be in the room, shared vs. distinct identity |

Each question shows a **rationale** — which gap or finding it comes from. **Keep**, **Drop**, or edit; drag to reorder. Kept questions go into the Word and PowerPoint exports as a "Questions for discussion" section. You can regenerate; kept questions are preserved.

---

## 12. Exporting the proposal

Click **Export** in the Workspace header.

| Format | What you get | Typical use |
|---|---|---|
| **Excel** | The client's original sheet layout with our Response, Compliance, and Owner columns appended; one tab per section | Compliance matrices, Darwinbox-led bids |
| **Word** | Cover, executive summary (auto-written from approved answers), responses grouped by section, CHRO questions appendix | Narrative proposals |
| **PowerPoint** | Joint value-proposition deck layout: context, approach, capability highlights, discussion questions | Pitch meetings |

Options: brand template (§14), include CHRO questions, include unapproved answers (they're watermarked *DRAFT* if you do).

Generation takes 10–60 seconds; the file appears under **Exports** with a download button. Every export is kept, so you can always retrieve what was sent.

---

## 13. The Knowledge Base

Menu → **Knowledge Base**. Four tabs:

**Darwinbox capabilities.** What the product can do, by module. Each entry: feature, description, availability (*standard / configurable / roadmap / not available*), source. This is the single biggest driver of draft quality — keep it current. Add entries by hand or **Upload source** (a module guide or release note) and the tool chunks it into entries for you to review.

**Kognoz services.** Our offerings, methodologies, and case studies.

**Approved answers.** Everything promoted from past RFPs, with reuse counts. Edit the canonical wording here — it improves every future draft that uses it. Delete anything outdated.

**Sources.** Files that were ingested, when, and how many entries they produced.

Search in any tab is semantic: "how do we handle multi-country payroll" finds entries even if those exact words aren't in them.

---

## 14. Brand templates (admin)

Menu → **Settings → Brand**. Set logo, primary/secondary colours, font, footer text, and optionally upload your own Word and PowerPoint templates. The live preview shows a sample page. The default template is used for all exports unless you pick another at export time.

---

## 15. Managing users (admin)

Menu → **Settings → Team**. **Invite** by Kognoz email and pick a role (§2). Change roles or remove members from the same screen. Removed members' edits and approvals stay in history.

---

## 16. Keyboard shortcuts (Workspace)

| Key | Action |
|---|---|
| `J` / `K` | Next / previous row |
| `Enter` | Open row in context panel |
| `E` | Edit answer |
| `A` | Approve (reviewer/admin) |
| `F` | Flag |
| `R` | Regenerate (opens instruction box) |
| `Cmd/Ctrl + S` | Save edit |
| `Esc` | Close panel / cancel edit |
| `/` | Focus search |
| `?` | Show this list |

---

## 17. Statuses explained

**RFP status**
| Status | Meaning |
|---|---|
| Draft | Created, files being uploaded |
| Parsing | Files being read |
| Questions ready | Extraction confirmed; ready to draft |
| Drafting | AI drafting in progress |
| In review | Drafts exist; being reviewed |
| Approved | All mandatory questions approved |
| Submitted | Sent to client (admin marks this) |
| Won / Lost | Outcome recorded; feeds analytics |

**Response status**
| Status | Meaning |
|---|---|
| AI draft | Written by the model, untouched |
| Edited | A person changed it |
| Approved | Locked by a reviewer |
| Flagged | Needs someone's input |

**Compliance**
| Value | Use when |
|---|---|
| Fully | Standard product / service does it |
| Partial | Some of the requirement is met; say what isn't |
| Via customization | Needs configuration or development |
| Via partner | Met through a third party |
| Not supported | Be honest; this feeds a CHRO question |
| N/A | Not applicable to this bid |

---

## 18. Troubleshooting

| Problem | What to do |
|---|---|
| File shows *Parse failed* | Password-protected PDFs and scanned images can't be read — remove the password or export a text PDF. Excel with heavily merged cells: unmerge and re-upload. |
| Extraction produced garbage / huge questions | Delete the RFP's questions and re-run **Extract** with *Row mode* (for spreadsheets) or *Paragraph mode* (for documents) from the Extract menu. |
| Drafting stuck at the same number for 10+ minutes | Open the job from the progress bar → **Cancel**, then **Draft all** again — completed answers are kept. If it repeats, tell an admin. |
| An answer is confidently wrong | Check *Sources used*: usually a knowledge-base entry is outdated. Fix the entry (§13) and regenerate. |
| Export missing our logo / wrong colours | Admin: check the brand template (§14) has a logo uploaded and the template file isn't corrupt. |
| "Not a member of this workspace" | Ask an admin to invite your Kognoz email (§15). |
| Can't approve | Only reviewers and admins can. Ask an admin for the role. |

---

## 19. FAQ

**Does the client ever see this tool?** No. Only exports leave the system.

**Will it invent Darwinbox features?** It only drafts from the knowledge base and shows its sources. If nothing relevant exists it marks the answer low-confidence or *Not supported* rather than guessing — which is why keeping the capability library current matters.

**Can Darwinbox's team answer their own rows?** Planned for a later phase (share link for Darwinbox-owned questions). Today: export the Excel, let them fill their column, re-upload as *Our prior response*.

**What happens to a client's data?** Files and answers stay in Kognoz's workspace. Promoted answers have client names stripped before entering the knowledge base.

**Can I use it for non-Darwinbox bids?** Yes — set owner to *Kognoz* on advisory questions; the drafter uses Kognoz services and past answers only.

**How long does an RFP take?** Typical 200-question RFP: upload and extraction 5 min, review of questions 5–10 min, drafting 10–15 min in the background, human review 2–4 hours, exports 1 min.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| RFP | Request for Proposal — the client's document of questions/requirements |
| Line item / question | One requirement the client wants answered |
| Response | Our answer to one question; has revisions |
| Revision | One version of a response (AI or human) |
| Compliance | How fully we/Darwinbox meet the requirement |
| Confidence | The model's own estimate (0–1) of how well-grounded its draft is |
| Owner | Who is accountable for the answer: Kognoz, Darwinbox, joint |
| Knowledge base (KB) | Darwinbox capabilities + Kognoz services + approved past answers |
| Capability entry | One KB record describing what a product feature does |
| Approved answer | A reusable, client-neutral answer promoted from a past RFP |
| CHRO questions | Discovery questions for the client's HR leadership, generated from gaps |
| Brand template | Logo, colours, fonts, and files that style exports |
| Bidder of record | The company formally submitting the bid |
| Job | A background task (parse, extract, draft, generate, export) with progress |
