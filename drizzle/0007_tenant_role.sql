-- The app connects as the table owner, and Neon gives console-created roles
-- BYPASSRLS, which no policy and no FORCE can override (only a superuser can
-- remove the attribute). So `withOrg` switches to this ordinary role for the
-- duration of its transaction: same connection, same credentials, no bypass —
-- the policies from 0006 finally apply. Hand-written; drizzle-kit cannot
-- express roles or grants.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rfp_tenant') THEN
    CREATE ROLE rfp_tenant NOLOGIN NOBYPASSRLS;
  END IF;
  -- Membership lets the connecting role SET ROLE to it. Repeating the grant is a no-op.
  EXECUTE format('GRANT rfp_tenant TO %I', current_user);
END
$do$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rfp_tenant;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rfp_tenant;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rfp_tenant;--> statement-breakpoint
-- Tables and sequences the app role creates later inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rfp_tenant;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rfp_tenant;
