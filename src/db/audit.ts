
import { db, type Db } from "@/db/client";
import { auditLog } from "@/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Every mutation writes one row. Pass the transaction so the audit row commits with the change. */
export async function writeAudit(
  executor: Tx | Db,
  input: {
    workspaceId: string;
    actorId: string | null;
    entity: string;
    entityId: string;
    action: string;
    diff?: Record<string, unknown>;
  },
) {
  await (executor ?? db).insert(auditLog).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    diff: input.diff ?? {},
  });
}
