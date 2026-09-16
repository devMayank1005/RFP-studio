import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function KnowledgeBaseLoading() {
  return (
    <>
      <PageHeader title="Knowledge base" description="Darwinbox capabilities, Kognoz services, approved answers and their sources — what every draft is allowed to cite.">
        <div className="-mb-5 flex gap-1">
          {[140, 120, 130, 80].map((w, i) => (
            <Skeleton key={i} className="my-2 h-4" style={{ width: w }} />
          ))}
        </div>
      </PageHeader>
      <div className="flex items-center gap-2 border-b px-6 py-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="p-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
