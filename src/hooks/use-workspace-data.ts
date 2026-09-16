"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { promoteToKb } from "@/app/actions/kb";
import { approveResponses, editResponse, flagResponse, setCompliance, unapproveResponses } from "@/app/actions/review";
import type { QuestionDetail, WorkspaceRow, WorkspaceSection } from "@/db/queries/workspace";
import type { Compliance } from "@/domain/enums";

export interface WorkspaceData {
  rows: WorkspaceRow[];
  sections: WorkspaceSection[];
}

export const workspaceKey = (rfpId: string) => ["workspace", rfpId] as const;
export const detailKey = (rfpId: string, questionId: string) => ["workspace", rfpId, "question", questionId] as const;

/**
 * TanStack Query owns the workspace. The server page hands the first render
 * over as initialData; every mutation patches the cache optimistically and
 * then refetches. Nothing here calls revalidatePath — the two caches must
 * not fight.
 */
export function useWorkspaceRows(rfpId: string, initial: WorkspaceData) {
  return useQuery<WorkspaceData>({
    queryKey: workspaceKey(rfpId),
    queryFn: async () => {
      const res = await fetch(`/api/rfps/${rfpId}/workspace`, { cache: "no-store" });
      if (!res.ok) throw new Error(`workspace ${res.status}`);
      return res.json();
    },
    initialData: initial,
    staleTime: 60_000,
  });
}

export type QuestionDetailJson = Omit<QuestionDetail, "response" | "revisions"> & {
  response: (Omit<NonNullable<QuestionDetail["response"]>, "approvedAt"> & { approvedAt: string | null }) | null;
  revisions: Array<Omit<QuestionDetail["revisions"][number], "createdAt"> & { createdAt: string }>;
};

export function useQuestionDetail(rfpId: string, questionId: string | null) {
  return useQuery<QuestionDetailJson>({
    queryKey: detailKey(rfpId, questionId ?? "none"),
    enabled: !!questionId,
    queryFn: async () => {
      const res = await fetch(`/api/rfps/${rfpId}/questions/${questionId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`question ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function usePrefetchDetail(rfpId: string) {
  const qc = useQueryClient();
  return useCallback(
    (questionId: string) =>
      qc.prefetchQuery({
        queryKey: detailKey(rfpId, questionId),
        queryFn: async () => (await fetch(`/api/rfps/${rfpId}/questions/${questionId}`, { cache: "no-store" })).json(),
        staleTime: 30_000,
      }),
    [qc, rfpId],
  );
}

type Patch = Partial<WorkspaceRow>;

function useOptimisticRows(rfpId: string) {
  const qc = useQueryClient();
  const key = workspaceKey(rfpId);
  const patchRows = useCallback(
    (ids: string[], patch: Patch | ((row: WorkspaceRow) => Patch)) => {
      const previous = qc.getQueryData<WorkspaceData>(key);
      qc.setQueryData<WorkspaceData>(key, (data) =>
        data
          ? { ...data, rows: data.rows.map((r) => (ids.includes(r.questionId) ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)) }
          : data,
      );
      return previous;
    },
    [qc, key],
  );
  const rollback = useCallback((previous: WorkspaceData | undefined) => previous && qc.setQueryData(key, previous), [qc, key]);
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: [...key, "question"] });
  }, [qc, key]);
  return { patchRows, rollback, invalidate };
}

export function useApprove(rfpId: string) {
  const { patchRows, rollback, invalidate } = useOptimisticRows(rfpId);
  return useMutation({
    mutationFn: (ids: string[]) => approveResponses(rfpId, ids),
    onMutate: (ids) => patchRows(ids, { status: "approved" }),
    onSuccess: (result, ids, previous) => {
      if (!result.ok) {
        rollback(previous);
        toast.error(result.error);
      } else if (ids.length > 1) toast.success(`${result.data.approved.length} approved`);
    },
    onError: (_e, _ids, previous) => {
      rollback(previous);
      toast.error("Could not approve.");
    },
    onSettled: invalidate,
  });
}

export function useUnapprove(rfpId: string) {
  const { patchRows, rollback, invalidate } = useOptimisticRows(rfpId);
  return useMutation({
    mutationFn: (ids: string[]) => unapproveResponses(rfpId, ids),
    onMutate: (ids) => patchRows(ids, { status: "edited" }),
    onSuccess: (result, _ids, previous) => {
      if (!result.ok) {
        rollback(previous);
        toast.error(result.error);
      }
    },
    onError: (_e, _ids, previous) => rollback(previous),
    onSettled: invalidate,
  });
}

export function useFlag(rfpId: string) {
  const { patchRows, rollback, invalidate } = useOptimisticRows(rfpId);
  return useMutation({
    mutationFn: ({ questionId, reason }: { questionId: string; reason: string }) => flagResponse(rfpId, questionId, reason),
    onMutate: ({ questionId }) => patchRows([questionId], { status: "flagged" }),
    onSuccess: (result, _v, previous) => {
      if (!result.ok) {
        rollback(previous);
        toast.error(result.error);
      }
    },
    onError: (_e, _v, previous) => rollback(previous),
    onSettled: invalidate,
  });
}

export function useEdit(rfpId: string) {
  const { patchRows, rollback, invalidate } = useOptimisticRows(rfpId);
  return useMutation({
    mutationFn: ({ questionId, text }: { questionId: string; text: string }) => editResponse(rfpId, questionId, text),
    onMutate: ({ questionId, text }) => patchRows([questionId], (r) => ({ status: "edited", responsePreview: text.slice(0, 240), version: (r.version ?? 0) + 1 })),
    onSuccess: (result, _v, previous) => {
      if (!result.ok) {
        rollback(previous);
        toast.error(result.error);
      } else toast.success(`Saved as revision ${result.data.version}`);
    },
    onError: (_e, _v, previous) => rollback(previous),
    onSettled: invalidate,
  });
}

export function useSetCompliance(rfpId: string) {
  const { patchRows, rollback, invalidate } = useOptimisticRows(rfpId);
  return useMutation({
    mutationFn: ({ questionId, compliance }: { questionId: string; compliance: Compliance }) => setCompliance(rfpId, questionId, compliance),
    onMutate: ({ questionId, compliance }) => patchRows([questionId], { compliance }),
    onSuccess: (result, _v, previous) => {
      if (!result.ok) {
        rollback(previous);
        toast.error(result.error);
      }
    },
    onError: (_e, _v, previous) => rollback(previous),
    onSettled: invalidate,
  });
}

/** "Add to KB": no row field changes, so no optimistic patch — the detail refetch flips the button to "In knowledge base". */
export function usePromoteToKb(rfpId: string) {
  const { invalidate } = useOptimisticRows(rfpId);
  return useMutation({
    mutationFn: (questionId: string) => promoteToKb(rfpId, questionId),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.error);
      else toast.success("Added to the knowledge base", { description: result.data.canonicalQuestion });
    },
    onError: () => toast.error("Could not add to the knowledge base."),
    onSettled: invalidate,
  });
}
