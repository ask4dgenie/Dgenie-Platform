-- Phase 1, Slice A -- seed data: Domain Nine (Genius Development), its
-- Discovery Project playbook, all twelve Genius Level rubric rows, and the
-- manually seeded first Mentor cohort. Content matches
-- src/modules/curriculum/genius-development-domain.ts,
-- src/modules/identity/mentor-bootstrap.ts, and prisma/seed.ts exactly.
--
-- Applied as a migration (via the Supabase MCP `apply_migration` tool)
-- rather than only via `prisma db seed`, for the same reason as Phase 0's
-- My Genie seed: this build environment has no network path to the
-- Supabase project. `prisma/seed.ts` is what a future session or CI run
-- should use going forward; its upserts are idempotent against these same
-- rows.
--
-- THE MENTOR BOOTSTRAP BELOW IS A DELIBERATE, TEMPORARY MEASURE, NOT THE
-- REAL CERTIFICATION PATH -- see src/modules/identity/mentor-bootstrap.ts's
-- own comment in full, and Roadmap Part 5's Phase 1 section. New Mentor
-- Certification (Architecture Spec Part Seven, Workflow 6) is Phase 2
-- scope; these three Mentor Role rows exist only so New Learner Onboarding
-- (Workflow 1) has a real caseload-eligible Mentor to assign a learner to.

DO $$
DECLARE
  domain_id TEXT := gen_random_uuid()::text;
  admin_id TEXT := gen_random_uuid()::text;
  mentor1_id TEXT := gen_random_uuid()::text;
  mentor2_id TEXT := gen_random_uuid()::text;
  mentor3_id TEXT := gen_random_uuid()::text;
BEGIN
  -- Domain Nine, Genius Development (Blueprint 04 Part Two, Domain Nine's
  -- own description, reproduced verbatim).
  INSERT INTO "curriculum_domains" ("id", "code", "locale", "name", "description", "created_at", "updated_at")
  VALUES (
    domain_id, 'GENIUS_DEVELOPMENT', 'en', 'Genius Development',
    'Every learner receives personalised opportunities to develop unique talents, pursue passion projects, receive mentoring, build a Genius Portfolio, explore future calling, and develop mastery. This domain ensures that no learner''s gifts remain undiscovered or undeveloped.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  -- Discovery Project playbook (Blueprint 04 Part Ten, reproduced verbatim).
  INSERT INTO "signature_experience_playbooks"
    ("id", "curriculum_domain_id", "type", "locale", "purpose", "structure", "evidence_standard", "created_at", "updated_at")
  VALUES (
    gen_random_uuid()::text, domain_id, 'DISCOVERY_PROJECT', 'en',
    'Exploring a personal interest or an emerging gift, typically the first formal project a learner completes, common in Chapter One and early Chapter Two.',
    'The Genie and mentor help the learner pick a genuine personal question, not an assigned topic; the learner explores it across at least two sessions; the outcome is a short, honest account of what they found, including what surprised them.',
    'The account must include one thing the learner did not expect to learn.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  -- The twelve Genius Levels (Blueprint 04 Part Four, reproduced per-level).
  INSERT INTO "genius_level_rubrics"
    ("id", "curriculum_domain_id", "level", "chapter", "level_name", "locale", "evidence_standard", "minimum_tier", "created_at", "updated_at")
  VALUES
    (gen_random_uuid()::text, domain_id, 1, 'DISCOVERY', 'Spark', 'en', 'Earned when a mentor and the Genius Portfolio together show a consistent pattern of the learner voluntarily engaging with something without being told to.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 2, 'DISCOVERY', 'Wonder', 'en', 'Earned when the portfolio shows repeated evidence of a learner generating their own questions, not only answering questions posed to them.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 3, 'DISCOVERY', 'Explorer', 'en', 'Earned when the portfolio shows evidence of voluntary exploration across at least three distinct domains.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 4, 'FOUNDATION', 'Builder', 'en', 'Earned when the portfolio contains at least one artifact the learner planned in advance and then completed.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 5, 'FOUNDATION', 'Artisan', 'en', 'Earned when the portfolio shows at least one documented revision cycle in the same domain.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 6, 'FOUNDATION', 'Voyager', 'en', 'Earned when a mentor confirms sustained independent effort over at least one full term in a chosen domain.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 7, 'MASTERY', 'Specialist', 'en', 'Earned when the portfolio shows a body of work in a single domain clearly beyond Chapter Two evidence, evaluated against the domain''s Tier 3 rubric bar.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 8, 'MASTERY', 'Strategist', 'en', 'Earned when the portfolio documents at least one project where the learner changed their approach in response to a real obstacle and explained the reasoning behind the change.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 9, 'MASTERY', 'Vanguard', 'en', 'Earned when a mentor and at least one peer can each point to a specific instance of the Vanguard''s initiative or leadership.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 10, 'LEGACY', 'Steward', 'en', 'Earned when a mentor confirms at least one sustained standing responsibility carried faithfully over a full term.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 11, 'LEGACY', 'Luminary', 'en', 'Earned when at least one mentee or peer, and one adult mentor, can each independently confirm the Luminary''s influence.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, domain_id, 12, 'LEGACY', 'Legacy Bearer', 'en', 'Earned through a formal portfolio review involving the learner, their mentor, and, where applicable, their family, and is the only Genius Level that requires a completed Masterpiece Project as a precondition.', 'PROFICIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  -- Bootstrap Administrator -- root of trust; no earlier Administrator
  -- exists to grant this, the same self-seeding precedent Blueprint 08 Part
  -- Three uses for the Constitutional Council and Oversight Body.
  INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
  VALUES (admin_id, 'admin-bootstrap@dgenie.internal', 'Bootstrap Administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "roles" ("id", "user_id", "role_type", "valid_from", "notes", "created_at", "updated_at")
  VALUES (
    gen_random_uuid()::text, admin_id, 'ADMINISTRATOR', CURRENT_TIMESTAMP,
    'Root bootstrap Administrator, self-seeded -- no earlier Administrator exists to grant this.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  -- The manually seeded first Mentor cohort (three Mentors).
  INSERT INTO "users" ("id", "email", "name", "created_at", "updated_at")
  VALUES
    (mentor1_id, 'mentor-bootstrap-1@dgenie.internal', 'Bootstrap Mentor 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (mentor2_id, 'mentor-bootstrap-2@dgenie.internal', 'Bootstrap Mentor 2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (mentor3_id, 'mentor-bootstrap-3@dgenie.internal', 'Bootstrap Mentor 3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "roles" ("id", "user_id", "role_type", "valid_from", "granted_by_user_id", "notes", "created_at", "updated_at")
  VALUES
    (gen_random_uuid()::text, mentor1_id, 'MENTOR', CURRENT_TIMESTAMP, admin_id, 'Manually seeded first Mentor cohort (Roadmap Part 5, Phase 1; confirmed by Duncan 2026-08-17) -- not the New Mentor Certification workflow, which is Phase 2 scope.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, mentor2_id, 'MENTOR', CURRENT_TIMESTAMP, admin_id, 'Manually seeded first Mentor cohort (Roadmap Part 5, Phase 1; confirmed by Duncan 2026-08-17) -- not the New Mentor Certification workflow, which is Phase 2 scope.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, mentor3_id, 'MENTOR', CURRENT_TIMESTAMP, admin_id, 'Manually seeded first Mentor cohort (Roadmap Part 5, Phase 1; confirmed by Duncan 2026-08-17) -- not the New Mentor Certification workflow, which is Phase 2 scope.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;
