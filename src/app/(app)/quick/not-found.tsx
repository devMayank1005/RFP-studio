import { Zap } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";

export default function QuickNotFound() {
  return (
    <EmptyState
      icon={Zap}
      title="That session isn't here"
      description="It may belong to another workspace, or it was not a Quick Q&A session."
      action={
        <Button asChild variant="outline">
          <Link href="/quick">Back to Quick Q&A</Link>
        </Button>
      }
    />
  );
}
