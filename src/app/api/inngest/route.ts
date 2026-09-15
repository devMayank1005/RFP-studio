import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Inngest's endpoint. Locally `pnpm inngest:dev` discovers it; in production
 * the app registers itself with `curl -X PUT https://<host>/api/inngest`
 * after the keys are set (see README).
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
