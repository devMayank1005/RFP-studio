/**
 * Loads .env.local (then .env) for scripts that run outside Next.js — seeds,
 * db:ping, kb:seed, drizzle. Import it FIRST, as a side-effect import:
 *
 *   import "@/lib/load-env";
 *   import { db } from "@/db/client";
 *
 * ES imports are evaluated in order, so this runs before `@/db/client`
 * asks for DATABASE_URL. Calling `config()` after the imports does not work —
 * the imports have already executed by then.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
