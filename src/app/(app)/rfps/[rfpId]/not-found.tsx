import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";

export default function RfpNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="That RFP isn't here"
      description="It may belong to another workspace or have been deleted."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to the pipeline</Link>
        </Button>
      }
    />
  );
}
