import { z } from "zod";

import { can } from "./access";
import { formatDate } from "./dates";
import type { ResponseStatus, Role } from "./enums";
import { generateRefNo, type ExtractedQuestion } from "./extraction";
import { isStaleQueuedJob } from "./jobs";
import { clipText } from "./search";

/**
 * Quick Q&A, the pure half: a lightweight session — pasted or uploaded
 * questions, some deal context, drafted straight away — that reuses the
 * RFP tables underneath. What the form accepts, how a session is named,
 * how a paste becomes pages the extractor can read, the deterministic
 * fallback when the model finds nothing, and which job the progress strip
 * shows. Blob, database and Inngest live in src/lib, src/db and src/inngest.
 */

export const QUICK_CLIENT_NAME = "Quick Q&A";
export const QUICK_SOURCES = ["paste", "document"] as const;
export type QuickSource = (typeof QUICK_SOURCES)[number];
export const QUICK_TEXT_MIN = 10;
export const QUICK_TEXT_MAX = 50_000;
export const QUICK_CONTEXT_MAX = 4_000;
export const QUICK_PAGE_CHARS = 6_000;
export const QUICK_TITLE_MAX = 80;
/** How long after intake finishes the page keeps polling for the draft job to appear. */
export const QUICK_HANDOFF_MS = 60_000;

/** Form fields; the file itself is checked in the action. A paste needs real text, a document needs none. */
export const quickInputSchema = z
  .object({
    source: z.enum(QUICK_SOURCES),
    text: z.string().trim().max(QUICK_TEXT_MAX, "Keep the paste under 50,000 characters.").optional().default(""),
    context: z.string().trim().max(QUICK_CONTEXT_MAX, "Keep the context under 4,000 characters.").optional().default(""),
    clientId: z
      .union([z.string().uuid("Pick a client from the list."), z.literal("")])
      .optional()
      .default("")
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.source !== "paste" || v.text.length >= QUICK_TEXT_MIN, { message: "Paste at least one question.", path: ["text"] });
export type QuickInput = z.infer<typeof quickInputSchema>;

export function firstLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? null;
}

/** The session's name: the first line of context, else the first question, else the date. */
export function quickTitle(input: { context: string; firstQuestion: string | null; date: string }): string {
  const line = firstLine(input.context);
  if (line && line.length >= 8) return clipText(line, QUICK_TITLE_MAX);
  const q = input.firstQuestion?.trim();
  if (q) return clipText(q, QUICK_TITLE_MAX);
  return `Quick Q&A · ${formatDate(input.date)}`;
}

export interface QuickPage {
  page: number;
  text: string;
}

/** Paragraph-preserving pages of at most `maxChars`; a single oversize paragraph is cut at lines, then characters. */
export function pastedPages(text: string, maxChars = QUICK_PAGE_CHARS): QuickPage[] {
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return [];
  const pieces: string[] = [];
  for (const paragraph of normalised.split(/\n\s*\n/)) {
    if (paragraph.length <= maxChars) {
      pieces.push(paragraph);
      continue;
    }
    let current = "";
    for (const line of paragraph.split("\n")) {
      if (line.length > maxChars) {
        if (current) pieces.push(current);
        current = "";
        for (let i = 0; i < line.length; i += maxChars) pieces.push(line.slice(i, i + maxChars));
        continue;
      }
      const next = current ? `${current}\n${line}` : line;
      if (next.length > maxChars) {
        pieces.push(current);
        current = line;
      } else current = next;
    }
    if (current) pieces.push(current);
  }
  const pages: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const next = current ? `${current}\n\n${piece}` : piece;
    if (current && next.length > maxChars) {
      pages.push(current);
      current = piece;
    } else current = next;
  }
  if (current) pages.push(current);
  return pages.map((t, i) => ({ page: i + 1, text: t }));
}

/** The paste in the shape a parsed file has, so the intake job reads both alike. */
export function pastedDocument(text: string): { kind: "text"; fileName: string; pages: QuickPage[]; text: string; stats: { pages: number; chars: number } } {
  const pages = pastedPages(text);
  const joined = pages.map((p) => p.text).join("\n\n");
  return { kind: "text", fileName: "Pasted questions", pages, text: joined, stats: { pages: pages.length, chars: joined.length } };
}

const LIST_MARKER = /^\s*(?:[-•*–—]|\(?\d+[.)]|Q\s*\d+\s*[:.)]?|[a-z][.)])\s*/i;

/** When the model finds no questions in a paste: every line worth reading becomes one, markers stripped. */
export function questionsFromLines(text: string): ExtractedQuestion[] {
  const out: ExtractedQuestion[] = [];
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((raw, lineIndex) => {
      const cleaned = raw.replace(LIST_MARKER, "").trim();
      if (cleaned.length < QUICK_TEXT_MIN) return;
      out.push({
        sourceRow: null,
        sourcePage: 1,
        refNo: generateRefNo(out.length),
        sectionTitle: "General",
        questionText: cleaned,
        acceptanceCriteria: null,
        questionType: "descriptive",
        isMandatory: false,
        owner: "joint",
        moduleHint: "general",
        rawMeta: { Line: String(lineIndex + 1) },
        existing: null,
      });
    });
  return out;
}

export interface QuickCountable {
  status: ResponseStatus | null;
  kbAnswerId: string | null;
}

export function quickCounts(rows: readonly QuickCountable[]): { total: number; drafted: number; approved: number; inKb: number } {
  return {
    total: rows.length,
    drafted: rows.filter((r) => r.status !== null).length,
    approved: rows.filter((r) => r.status === "approved").length,
    inKb: rows.filter((r) => r.kbAnswerId !== null).length,
  };
}

export function quickPermissions(role: Role) {
  return {
    create: can(role, "rfp.create"),
    edit: can(role, "response.edit"),
    draft: can(role, "response.draft"),
    approve: can(role, "response.approve"),
    promote: can(role, "kb.promote"),
    flag: can(role, "response.flag"),
  };
}

export interface JobLike {
  status: string;
  createdAt: Date | string;
  finishedAt?: Date | string | null;
}

export interface QuickStage {
  /** Which job the strip shows. */
  show: "intake" | "draft" | null;
  failed: boolean;
  /** Queued for so long that no worker will take it; offer a retry. */
  stale: boolean;
  /** Keep refreshing the page. */
  active: boolean;
}

function inFlight(job: JobLike | null): boolean {
  return !!job && (job.status === "queued" || job.status === "running");
}

/** Intake first, then drafting; a short grace period between the two so the page keeps polling until the draft job exists. */
export function quickStage(input: { intake: JobLike | null; draft: JobLike | null; questionCount: number; now: Date }): QuickStage {
  const { intake, draft, now } = input;
  const stage = (show: "intake" | "draft", job: JobLike): QuickStage => {
    const stale = isStaleQueuedJob(job, now);
    return { show, failed: job.status === "failed", stale, active: inFlight(job) && !stale };
  };
  if (intake && (inFlight(intake) || intake.status === "failed")) return stage("intake", intake);
  if (draft && (inFlight(draft) || draft.status === "failed")) return stage("draft", draft);
  if (intake?.status === "done" && !draft && intake.finishedAt) {
    const handoff = now.getTime() - new Date(intake.finishedAt).getTime() < QUICK_HANDOFF_MS;
    return { show: null, failed: false, stale: false, active: handoff };
  }
  return { show: null, failed: false, stale: false, active: false };
}
