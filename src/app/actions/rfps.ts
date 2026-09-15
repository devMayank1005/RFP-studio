"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { clients, rfps } from "@/db/schema";
import { BIDDERS, ENGAGEMENT_TYPES } from "@/domain/enums";
import { ActionError, parseInput, requireCan, type ActionResult } from "@/lib/actions";

const createRfpSchema = z
  .object({
    title: z.string().trim().min(3, "Give the RFP a title").max(200),
    engagementType: z.enum(ENGAGEMENT_TYPES),
    bidderOfRecord: z.enum(BIDDERS),
    dueDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),
    clientId: z.string().uuid().or(z.literal("")).transform((v) => (v === "" ? null : v)),
    newClientName: z.string().trim().max(120).optional().default(""),
    newClientIndustry: z.string().trim().max(120).optional().default(""),
    newClientHeadcount: z.string().trim().optional().default(""),
  })
  .refine((v) => v.clientId || v.newClientName.length >= 2, {
    message: "Pick a client or name a new one",
    path: ["clientId"],
  });

export type CreateRfpState = ActionResult<{ rfpId: string }> | null;

async function createRfp(formData: FormData): Promise<string> {
  const session = await requireCan("rfp.create");
  const input = parseInput(createRfpSchema, Object.fromEntries(formData));

  return db.transaction(async (tx) => {
    let clientId = input.clientId;
    if (!clientId) {
      const headcount = Number.parseInt(input.newClientHeadcount.replace(/[^\d]/g, ""), 10);
      const [client] = await tx
        .insert(clients)
        .values({
          workspaceId: session.workspaceId,
          name: input.newClientName,
          industry: input.newClientIndustry || null,
          headcount: Number.isFinite(headcount) ? headcount : null,
        })
        .returning({ id: clients.id });
      clientId = client.id;
      await writeAudit(tx, {
        workspaceId: session.workspaceId,
        actorId: session.userId,
        entity: "client",
        entityId: clientId,
        action: "client.created",
        diff: { name: input.newClientName },
      });
    }

    const [rfp] = await tx
      .insert(rfps)
      .values({
        workspaceId: session.workspaceId,
        clientId,
        title: input.title,
        engagementType: input.engagementType,
        bidderOfRecord: input.bidderOfRecord,
        dueDate: input.dueDate,
        createdBy: session.userId,
      })
      .returning({ id: rfps.id });
    await writeAudit(tx, {
      workspaceId: session.workspaceId,
      actorId: session.userId,
      entity: "rfp",
      entityId: rfp.id,
      action: "rfp.created",
      diff: { title: input.title, clientId },
    });
    return rfp.id;
  });
}

/** Wizard step 1. Creates the client if needed, then a draft RFP, and moves to Upload. */
export async function createDraftRfp(_prev: CreateRfpState, formData: FormData): Promise<CreateRfpState> {
  let rfpId: string;
  try {
    rfpId = await createRfp(formData);
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    throw err;
  }
  // Outside the try: redirect() throws by design and must not be caught.
  redirect(`/rfps/${rfpId}/setup/upload`);
}
