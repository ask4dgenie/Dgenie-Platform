-- Phase 0 — Row-Level Security policy framework + Audit Log append-only grants
--
-- Architecture Spec Part Six: "Every learner-owned table carries a Postgres
-- Row-Level Security policy expressing Section Nine's rule directly at the
-- database layer, in addition to an application-layer authorization check in
-- the relevant module. This is deliberate redundancy."
--
-- Architecture Spec Part Eight / Part Ten: the Audit Log is "append-only at the
-- database level (no UPDATE or DELETE grant exists on that table for any
-- application role), so that an audit trail cannot be quietly edited even by a
-- compromised application credential."
--
-- This is a second, hand-written migration rather than something Prisma's own
-- `prisma migrate dev` could generate from schema.prisma, because Prisma's
-- stable schema DSL has no first-class representation for Postgres RLS
-- policies or role/GRANT statements — this is the standard, documented pattern
-- for Prisma + Postgres RLS (a companion raw-SQL migration alongside the
-- Prisma-generated schema migration), not a deviation invented for this repo.

-- ============================================================================
-- APPLICATION DATABASE ROLE
--
-- Prisma Migrate itself runs as the Supabase project's privileged `postgres`
-- role (or an equivalent owner role), which is how the migration above and
-- this one are applied. Row-Level Security does not restrict a table's owner
-- by default, so the running application must connect as a *different*,
-- least-privileged role for RLS to actually take effect at runtime — this is
-- that role. Its password is set out-of-band via a separate, uncommitted
-- `ALTER ROLE ... WITH PASSWORD` statement (see the Phase 0 PR description),
-- never written into a migration file that lands in git.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dgenie_app') THEN
    CREATE ROLE dgenie_app LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO dgenie_app;

-- ============================================================================
-- SESSION-CONTEXT HELPER
--
-- The application sets a transaction-local Postgres setting,
-- `app.current_user_id`, at the start of every request scoped to an
-- authenticated session (see apps/web/src/lib/db/rls.ts), via
-- `SELECT set_config('app.current_user_id', $1, true)`. Every RLS policy
-- below reads it through this helper rather than referencing
-- `current_setting` directly in each policy, so the convention is defined
-- once. Returns NULL (not an error) when unset, which every policy below
-- treats as "no authenticated user" — i.e. no rows visible, the fail-closed
-- default appropriate for a safeguarding-relevant property (Part Six).
-- ============================================================================

-- `SET search_path = public` closes a real finding from Supabase's own
-- security advisor (`function_search_path_mutable`, run per this migration's
-- own "run get_advisors after writing these and fix anything it flags"
-- instruction): without a pinned search_path, a SECURITY DEFINER-adjacent
-- function is vulnerable to search_path injection from a role that can create
-- objects earlier in an unpinned path. Fixed here rather than left for a
-- later pass.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;

-- ============================================================================
-- USERS — a learner's (or any person's) own identity record.
-- ============================================================================

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON "users"
  FOR SELECT
  USING ("id" = app_current_user_id());

-- Account creation must be possible before a session exists to check against
-- — this is the one deliberate, narrow permissive-insert exception in this
-- migration, named explicitly per this project's own "record a gap rather
-- than absorb it" discipline rather than left as a silent hole. Application-
-- layer validation (Architecture Spec Part Six's "two layers, not one") is
-- what actually bounds what a sign-up request may set on this row.
CREATE POLICY "users_insert_signup" ON "users"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE
  USING ("id" = app_current_user_id())
  WITH CHECK ("id" = app_current_user_id());

GRANT SELECT, INSERT, UPDATE ON "users" TO dgenie_app;

-- ============================================================================
-- ACCOUNTS / SESSIONS / VERIFICATION_TOKENS — Auth.js's own internal
-- bookkeeping tables, not part of Blueprint 08 Part Four Section Nine's
-- Information Architecture ownership table. Treated as system tables the
-- Auth.js adapter must be able to read and write as part of the auth flow
-- itself (including before a request-scoped user id is known, e.g. an
-- email-verification callback) rather than learner-owned content — a
-- narrower, explicitly-scoped exception, not a silent gap in the "every
-- learner-owned table" rule, which these tables are not instances of.
-- ============================================================================

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "accounts_select_own" ON "accounts" FOR SELECT USING ("user_id" = app_current_user_id());
CREATE POLICY "accounts_all_service" ON "accounts" FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounts" TO dgenie_app;

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessions_select_own" ON "sessions" FOR SELECT USING ("user_id" = app_current_user_id());
CREATE POLICY "sessions_all_service" ON "sessions" FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "sessions" TO dgenie_app;

ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "verification_tokens_all_service" ON "verification_tokens" FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON "verification_tokens" TO dgenie_app;

-- ============================================================================
-- ROLES — Part Six: role resolution is dynamic, per-request, never cached.
-- Phase 0 grants read-only access to the application role; a Role is written
-- only via a privileged/administrative path (an Administrator-run seed or
-- future admin workflow), not through the RLS-scoped runtime role, since no
-- onboarding or certification workflow that grants roles through the app
-- exists yet in this phase (Part Nine non-goals).
-- ============================================================================

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;

CREATE POLICY "roles_select_own" ON "roles"
  FOR SELECT
  USING ("user_id" = app_current_user_id());

GRANT SELECT ON "roles" TO dgenie_app;

-- ============================================================================
-- PARENT_LINKS — the consent/recovery relationship, per Blueprint 12.
-- Visible to both participants (parent and minor); write access is a
-- privileged/administrative path in Phase 0, same reasoning as roles above.
-- ============================================================================

ALTER TABLE "parent_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY "parent_links_select_participant" ON "parent_links"
  FOR SELECT
  USING (
    "parent_user_id" = app_current_user_id()
    OR "minor_user_id" = app_current_user_id()
  );

GRANT SELECT ON "parent_links" TO dgenie_app;

-- ============================================================================
-- AGENT_DEFINITIONS — not learner-owned data; global agent configuration.
-- Readable by any authenticated application connection (needed so the
-- gateway skeleton can resolve a definition at all), written only via a
-- privileged seed path (see prisma/seed.ts) — Phase 0 populates exactly one
-- real row (My Genie) and no in-app editing UI exists yet.
-- ============================================================================

ALTER TABLE "agent_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_definitions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "agent_definitions_select_all" ON "agent_definitions"
  FOR SELECT
  USING (true);

GRANT SELECT ON "agent_definitions" TO dgenie_app;

-- ============================================================================
-- AGENT_INTERACTIONS — Part Six: "My Genie, acting on behalf of a learner,
-- can never see more than that learner could see themselves." Scoped to the
-- human the interaction was performed on behalf of. Insert-only beyond that
-- (Part Five: "a complete, immutable AgentInteraction record") — no update or
-- delete grant.
-- ============================================================================

ALTER TABLE "agent_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_interactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "agent_interactions_select_own" ON "agent_interactions"
  FOR SELECT
  USING ("user_id" = app_current_user_id());

CREATE POLICY "agent_interactions_insert_own" ON "agent_interactions"
  FOR INSERT
  WITH CHECK ("user_id" = app_current_user_id());

GRANT SELECT, INSERT ON "agent_interactions" TO dgenie_app;

-- ============================================================================
-- AUDIT_LOG_ENTRIES — append-only at the database level. Architecture Spec
-- Part Eight, verbatim: "no UPDATE or DELETE grant exists on that table for
-- any application role." Readable by whoever is a participant (actor or
-- target); insertable by the application scoped to its own actor; never
-- updatable or deletable by dgenie_app, full stop.
--
-- Residual limitation, named rather than smoothed over: this protects against
-- the application's own runtime credential (dgenie_app) or a bug in
-- application code. It does not, and structurally cannot, protect against a
-- Postgres superuser/table-owner connection (the same `postgres`-equivalent
-- role Prisma Migrate itself uses) choosing to bypass RLS and issue a raw
-- UPDATE or DELETE directly — no grant-level restriction can bind a role
-- that owns the table. That residual risk is a database-administration
-- access-control question (who holds the Supabase project's owner
-- credentials, and how tightly that's held), not something this migration's
-- SQL can close, and is worth naming to whoever reviews this rather than
-- leaving the append-only claim looking more absolute than it is.
-- ============================================================================

ALTER TABLE "audit_log_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_participant" ON "audit_log_entries"
  FOR SELECT
  USING (
    "target_user_id" = app_current_user_id()
    OR "actor_user_id" = app_current_user_id()
  );

CREATE POLICY "audit_log_insert_own" ON "audit_log_entries"
  FOR INSERT
  WITH CHECK (
    "actor_user_id" = app_current_user_id()
    OR "actor_user_id" IS NULL
  );

GRANT SELECT, INSERT ON "audit_log_entries" TO dgenie_app;
REVOKE UPDATE, DELETE ON "audit_log_entries" FROM dgenie_app;
REVOKE UPDATE, DELETE ON "audit_log_entries" FROM PUBLIC;
