import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/session";

import { SwaggerUi } from "./swagger-ui";

export const metadata: Metadata = { title: "API reference" };

/**
 * The OpenAPI reference, rendered by Swagger UI from /openapi.yaml. The spec
 * is the design contract for the REST surface; docs/api-status.md says which
 * operations exist today and which are still served by server actions.
 */
export default async function ApiDocsPage() {
  await requireSession();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="API reference" description="OpenAPI 3.1 — the contract for RFP Studio's HTTP surface. Operations marked planned in docs/api-status.md are not live yet." />
      <SwaggerUi specUrl="/openapi.yaml" />
    </div>
  );
}
