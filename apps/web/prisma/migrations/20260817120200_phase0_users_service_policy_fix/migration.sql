-- Correction to 20260817120100_phase0_rls_and_audit_grants.
--
-- Auth.js's own Prisma adapter must be able to look up an arbitrary user row
-- by email or linked OAuth account *before* any session exists — that is
-- literally what sign-in is (`getUserByEmail`, `getUserByAccount`,
-- `createUser`, `linkAccount`, ...). The three narrow own-row policies the
-- previous migration put on "users" (`users_select_own`, `users_insert_signup`,
-- `users_update_own`) would silently break every one of those pre-session
-- lookups the moment a real sign-in flow is exercised, since
-- `app_current_user_id()` is necessarily unset at that point.
--
-- "users" is treated the same way "accounts", "sessions", and
-- "verification_tokens" already are in the previous migration: Auth.js's own
-- trusted internal bookkeeping table, structurally analogous to Supabase's
-- own `auth.users` schema sitting outside end-user Row-Level Security, not
-- an ordinary application table a client query can reach directly. Per-row
-- visibility (never exposing another family's name, email, or image to a
-- client) is enforced at the application layer instead -- Architecture Spec
-- Part Six's "two layers, not one," with the *second* layer here being the
-- Next.js server code's own query shaping, not a database policy this
-- environment could not actually exercise end-to-end against a live sign-in
-- flow to verify. A single shared `dgenie_app` Postgres role, with no second,
-- narrower "auth service" role to back a real per-row database policy, made
-- attempting one here RLS theater rather than a defensible control -- see
-- the Phase 0 PR description for the fuller reasoning and the follow-up this
-- leaves for Phase 1, once real sign-in flows exist to test against.
--
-- RLS remains genuinely enforced, and is where Part Six's database-layer
-- redundancy actually earns its keep in this phase, on "roles",
-- "parent_links", "agent_interactions", and "audit_log_entries" -- the
-- tables that hold who is what to whom and what happened, which is what
-- Blueprint 08 Part Four Section Nine's Information Architecture table is
-- actually protecting.

DROP POLICY IF EXISTS "users_select_own" ON "users";
DROP POLICY IF EXISTS "users_insert_signup" ON "users";
DROP POLICY IF EXISTS "users_update_own" ON "users";

CREATE POLICY "users_all_service" ON "users"
  FOR ALL
  USING (true)
  WITH CHECK (true);
