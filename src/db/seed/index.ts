/**
 * Seed: workspace, brand template, clients, knowledge base and a demo RFP.
 *
 * Idempotent — every row has a deterministic id (see ids.ts) and is upserted,
 * so `pnpm db:seed` can run on a fresh database or over an existing one.
 * Embeddings are NOT written here (they need a Voyage key); `pnpm kb:seed`
 * fills in every null embedding afterwards.
 */
import "@/lib/load-env";

import { eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import {
  brandTemplates,
  clients,
  kbEntries,
  organization,
  responseCitations,
  responseRevisions,
  responses,
  rfpQuestions,
  rfpSections,
  rfps,
} from "@/db/schema";

import { CLIENTS } from "./data/clients";
import { DEMO_RFP, DEMO_SECTIONS, VEDANTA_RFP } from "./data/demo-rfp";
import { KB_ENTRIES, KB_ENTRY_ID } from "./data/kb";
import { BRAND_TEMPLATE_ID, VOICE_GUIDE, WORKSPACE_ID, WORKSPACE_NAME, WORKSPACE_SLUG } from "./data/workspace";
import { stableId } from "./ids";

/** `set` clause that copies every non-id column from EXCLUDED, for upserts. */
function excludedSet<T extends PgTable>(table: T, keys: string[]): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const key of keys) {
    if (key === "id") continue;
    const col = columns[key];
    if (col) set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

async function seedWorkspace() {
  await db
    .insert(organization)
    .values({ id: WORKSPACE_ID, name: WORKSPACE_NAME, slug: WORKSPACE_SLUG, createdAt: new Date() })
    .onConflictDoUpdate({ target: organization.id, set: { name: WORKSPACE_NAME, slug: WORKSPACE_SLUG } });

  const brand = {
    id: BRAND_TEMPLATE_ID,
    workspaceId: WORKSPACE_ID,
    name: "Kognoz default",
    logoUrl: "/brand/kognoz-logo.png",
    primaryColor: "#005184",
    accentColor: "#2B9E85",
    successColor: "#71A247",
    fontFamily: "Inter",
    footerText: "Kognoz Consulting & Research Pvt. Ltd. · Confidential",
    voiceGuide: VOICE_GUIDE,
    isActive: true,
  };
  await db
    .insert(brandTemplates)
    .values(brand)
    .onConflictDoUpdate({ target: brandTemplates.id, set: excludedSet(brandTemplates, Object.keys(brand)) });
}

async function seedClients() {
  const rows = CLIENTS.map((c) => ({ ...c, workspaceId: WORKSPACE_ID }));
  await db
    .insert(clients)
    .values(rows)
    .onConflictDoUpdate({ target: clients.id, set: excludedSet(clients, Object.keys(rows[0])) });
}

async function seedKb() {
  const rows = KB_ENTRIES.map((e) => ({
    id: KB_ENTRY_ID(e.slug),
    workspaceId: WORKSPACE_ID,
    entryType: e.entryType,
    product: e.product,
    module: e.module,
    featureName: e.featureName,
    body: e.body,
    availability: e.availability,
    tags: e.tags,
    isActive: true,
  }));
  // Body changes must invalidate the embedding, or retrieval cites stale text.
  await db
    .insert(kbEntries)
    .values(rows)
    .onConflictDoUpdate({
      target: kbEntries.id,
      set: {
        ...excludedSet(kbEntries, Object.keys(rows[0])),
        embedding: sql`case when ${kbEntries.body} is distinct from excluded."body" then null else ${kbEntries.embedding} end`,
      },
    });
  return rows.length;
}

async function seedDemoRfp() {
  const rfpRows = [
    { ...DEMO_RFP, workspaceId: WORKSPACE_ID },
    { ...VEDANTA_RFP, workspaceId: WORKSPACE_ID },
  ];
  for (const row of rfpRows) {
    await db
      .insert(rfps)
      .values(row)
      .onConflictDoUpdate({ target: rfps.id, set: excludedSet(rfps, Object.keys(row)) });
  }

  let questionCount = 0;
  let sortOrder = 0;
  for (const [sIdx, section] of DEMO_SECTIONS.entries()) {
    const sectionId = stableId("rfp_section", `${DEMO_RFP.id}:${section.refCode}`);
    await db
      .insert(rfpSections)
      .values({ id: sectionId, rfpId: DEMO_RFP.id, title: section.title, refCode: section.refCode, sortOrder: sIdx })
      .onConflictDoUpdate({
        target: rfpSections.id,
        set: { title: section.title, refCode: section.refCode, sortOrder: sIdx },
      });

    for (const item of section.questions) {
      const questionId = stableId("rfp_question", `${DEMO_RFP.id}:${item.ref}`);
      const question = {
        id: questionId,
        rfpId: DEMO_RFP.id,
        sectionId,
        refNo: item.ref,
        questionText: item.text,
        questionType: item.type,
        isMandatory: item.mandatory,
        owner: item.owner,
        moduleHint: item.module,
        rawMeta: item.meta,
        sortOrder: sortOrder++,
      };
      await db
        .insert(rfpQuestions)
        .values(question)
        .onConflictDoUpdate({ target: rfpQuestions.id, set: excludedSet(rfpQuestions, Object.keys(question)) });
      questionCount++;

      if (!item.response) continue;
      const responseId = stableId("response", questionId);
      const revisionId = stableId("response_revision", `${responseId}:1`);

      await db
        .insert(responses)
        .values({
          id: responseId,
          questionId,
          status: item.response.status,
          compliance: item.response.compliance,
          confidence: item.response.confidence.toFixed(3),
          approvedAt: item.response.status === "approved" ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: responses.id,
          set: {
            status: item.response.status,
            compliance: item.response.compliance,
            confidence: item.response.confidence.toFixed(3),
          },
        });

      await db
        .insert(responseRevisions)
        .values({
          id: revisionId,
          responseId,
          version: 1,
          draftText: item.response.text,
          finalText: item.response.text,
          generatedBy: "model",
          model: "claude-sonnet-5",
          promptVersion: "seed",
          openPoints: item.response.openPoints ?? [],
        })
        .onConflictDoUpdate({
          target: responseRevisions.id,
          set: { draftText: item.response.text, finalText: item.response.text, openPoints: item.response.openPoints ?? [] },
        });

      await db.update(responses).set({ currentRevisionId: revisionId }).where(eq(responses.id, responseId));

      await db.delete(responseCitations).where(eq(responseCitations.revisionId, revisionId));
      if (item.response.citations.length) {
        await db.insert(responseCitations).values(
          item.response.citations.map((slug, i) => {
            const entry = KB_ENTRIES.find((e) => e.slug === slug);
            if (!entry) throw new Error(`demo citation refers to unknown kb slug ${slug}`);
            return {
              id: stableId("response_citation", `${revisionId}:${i + 1}`),
              revisionId,
              ordinal: i + 1,
              sourceType: "kb_entry" as const,
              sourceId: KB_ENTRY_ID(slug),
              similarity: (0.82 - i * 0.04).toFixed(4),
              excerpt: entry.body.slice(0, 220),
              reason: `Supports the ${entry.featureName.toLowerCase()} claim.`,
            };
          }),
        );
      }
    }
  }
  return questionCount;
}

async function main() {
  console.log("[seed] workspace + brand");
  await seedWorkspace();
  console.log("[seed] clients");
  await seedClients();
  const kb = await seedKb();
  console.log(`[seed] knowledge base: ${kb} entries (embeddings pending — run pnpm kb:seed)`);
  const questions = await seedDemoRfp();
  console.log(`[seed] demo RFP: ${questions} questions`);
}

main()
  .then(() => {
    console.log("[seed] done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
