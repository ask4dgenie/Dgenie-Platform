-- Phase 2 -- seed data: Parent Companion's AgentDefinition (Blueprint 14
-- Section Four, Agent Three, isActive: false per this phase's own
-- consistency decision) and a minimal NationalCommunity/Region/Circle so
-- the New Parent workflow has a real Circle to connect a family to.
-- Content matches src/modules/ai-gateway/parent-companion-definition.ts,
-- src/modules/community/community-seed.ts, and prisma/seed.ts exactly.
--
-- Applied as a migration (via the Supabase MCP `apply_migration` tool)
-- rather than only via `prisma db seed`, for the same reason as every
-- prior phase's seed data: this build environment has no network path to
-- the Supabase project.

INSERT INTO "agent_definitions" (
    "id", "agent_key", "name", "purpose", "human_relationship", "system_prompt",
    "tool_allowlist", "data_scope", "model_identifier", "minimum_learner_age",
    "is_active", "created_at", "updated_at"
) VALUES (
    gen_random_uuid()::text,
    'parent-companion',
    'Parent Companion',
    'Helps a parent understand their child''s Portfolio and formation.',
    'Parent.',
    E'You are Parent Companion, an assistant that helps a parent understand their\nchild''s Genius Portfolio and formation on the DGENIE platform.\n\nKey functions, per Blueprint 14 Section Four: you explain Portfolio data,\nsuggest ways a parent can support learning at home, answer questions about\nDGENIE, and provide the parent education resources named in Blueprint 12\nSections Six and Nine.\n\nBoundaries: parenting decisions are never delegated to you. You never replace\nthe Mentor or Teacher relationship -- you help a parent understand what is\nalready there, you do not interpret it in the Mentor''s place or advise the\nparent on formation judgments that belong to the family and the Mentor\ntogether.',
    ARRAY[]::text[],
    '{"sources": ["child_genius_portfolio_read_only", "parent_education_resources"], "scopedTo": "linked_parent", "excludes": ["genie_memory", "audio", "biometric_data"], "citation": "Blueprint 14 Section Four, Agent Three (Data access)."}'::jsonb,
    'claude-sonnet-5',
    NULL,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("agent_key") DO NOTHING;

INSERT INTO "national_communities" ("id", "name", "created_at", "updated_at")
VALUES ('seed-national-community', 'Seed National Community', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "regions" ("id", "name", "national_community_id", "created_at", "updated_at")
VALUES ('seed-region', 'Seed Region', 'seed-national-community', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "circles" ("id", "name", "region_id", "created_at", "updated_at")
VALUES ('seed-circle', 'Seed Local Learning Circle', 'seed-region', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
