import { and, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { writeAudit } from "@/db/audit";
import { db, withOrg } from "@/db/client";
import { bumpJobProgress, finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { getChroClientContext, getChroSourceRows } from "@/db/queries/chro";
import { chroQuestions } from "@/db/schema";
import { assignSortOrders, selectChroSources, type ChroInput } from "@/domain/chro";
import { generateChroQuestions } from "@/engine/chro";
import { failJob } from "@/lib/jobs";

import { CHRO_PROMPT_VERSION } from "../../prompts/chro";

import { chroRequested, inngest } from "./client";

/**
 * One Opus call, three durable steps. Kept questions always survive; in
 * replace mode the previous suggestions and drops make way for the new set.
 */
export const generateChro = inngest.createFunction(
  {
    id: "generate-chro-questions",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.jobId",
    // Per-workspace fairness first, then a global ceiling.
    concurrency: [
      { limit: 2, key: "event.data.workspaceId" },
      { limit: 4 },
    ],
    triggers: [chroRequested],
    onFailure: async ({ event, error }) => {
      await failJob(event.data.event.data.jobId, error, { where: "job:chro", rfpId: event.data.event.data.rfpId });
    },
  },
  async ({ event, step, runId }) => {
    const { rfpId, workspaceId, jobId, actorId, mode } = event.data;

    const input = await step.run("prepare", async (): Promise<ChroInput & { workspaceId: string }> => {
      await markJobRunning(jobId, runId);
      await setJobProgress(jobId, 0, 3);
      const ctx = await withOrg(workspaceId, (tx) => getChroClientContext(rfpId, tx));
      if (!ctx) throw new NonRetriableError("rfp not found");
      const { approved, gaps } = selectChroSources(await withOrg(workspaceId, (tx) => getChroSourceRows(rfpId, tx)));
      const kept = await db
        .select({ theme: chroQuestions.theme, questionText: chroQuestions.questionText })
        .from(chroQuestions)
        .where(and(eq(chroQuestions.rfpId, rfpId), eq(chroQuestions.status, "kept")));
      await bumpJobProgress(jobId);
      return { ...ctx, approved, gaps, keptQuestions: kept };
    });

    const generated = await step.run("generate", async () => {
      const result = await generateChroQuestions(input);
      await bumpJobProgress(jobId);
      return result;
    });

    const inserted = await step.run("persist", async () => {
      await db.transaction(async (tx) => {
        if (mode === "replace_suggested") {
          await tx.delete(chroQuestions).where(and(eq(chroQuestions.rfpId, rfpId), inArray(chroQuestions.status, ["suggested", "dropped"])));
        }
        const existing = await tx.select({ theme: chroQuestions.theme, sortOrder: chroQuestions.sortOrder }).from(chroQuestions).where(eq(chroQuestions.rfpId, rfpId));
        const orders = assignSortOrders(existing, generated.questions);
        await tx.insert(chroQuestions).values(
          generated.questions.map((q, i) => ({ rfpId, theme: q.theme, questionText: q.questionText, rationale: q.rationale, sortOrder: orders[i], status: "suggested" as const })),
        );
        await writeAudit(tx, {
          workspaceId: input.workspaceId,
          actorId,
          entity: "rfp",
          entityId: rfpId,
          action: "chro.generated",
          diff: { count: generated.questions.length, mode, model: generated.model, promptVersion: CHRO_PROMPT_VERSION, usage: { inputTokens: generated.usage.inputTokens, outputTokens: generated.usage.outputTokens } },
        });
      });
      await bumpJobProgress(jobId);
      await finishJob(jobId, "done");
      return generated.questions.length;
    });

    return { inserted };
  },
);
