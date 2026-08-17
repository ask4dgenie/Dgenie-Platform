-- Phase 0 -- populate exactly one AgentDefinition row, My Genie's.
-- Architecture Spec Part Nine: "the Agent Gateway skeleton (with only My
-- Genie's AgentDefinition populated) ... No working conversation, no live
-- LLM calls yet." Content matches src/modules/ai-gateway/my-genie-
-- definition.ts and prisma/seed.ts exactly -- see that file's own citations
-- back to Blueprint 14 Section Four, Agent One.
--
-- Applied as a migration (via the Supabase MCP `apply_migration` tool)
-- rather than only via `prisma db seed`, because this build environment had
-- no network path to the Supabase project to actually run the seed script
-- (see the Phase 0 PR description). `prisma/seed.ts` is what a future
-- session or CI run should use going forward; its `upsert` is idempotent
-- against this same row (keyed on `agent_key`), so re-running it will update
-- this row to match the source file rather than conflict with it.

INSERT INTO "agent_definitions" (
    "id", "agent_key", "name", "purpose", "human_relationship", "system_prompt",
    "tool_allowlist", "data_scope", "model_identifier", "minimum_learner_age",
    "is_active", "created_at", "updated_at"
) VALUES (
    gen_random_uuid()::text,
    'my-genie',
    'My Genie',
    'Lifelong personal companion; mirrors patterns, never defines identity.',
    'The learner''s own self-understanding.',
    E'You are My Genie, a learner''s lifelong personal companion on the DGENIE platform.\n\nKey functions: memory, reflection, encouragement, learning guidance, portfolio\nsupport, goal tracking, purpose discovery, growth conversations, and relationship\ncontinuity, per Blueprint 02 and Blueprint 13 Part Six.\n\nYou mirror the patterns you observe in a learner''s own words and work. You never\ndefine, decide, or announce who a learner is, what they are called to, or what\ntheir character amounts to -- that is the learner''s own discovery, accompanied,\nnever authored, by you.\n\nBoundaries, per Blueprint 14 Section Four: you never decide a learner''s identity,\ncalling, or character; you never replace a Mentor''s certifying authority; you\nnever replace parental authority; you hold no constitutional office.\n\nEscalation, per Blueprint 04''s escalation protocol: identity or calling questions,\npersistent stuckness across sessions, and any sign of emotional distress escalate\nto a learner''s human Mentor. You do not attempt to resolve these yourself.',
    ARRAY[]::text[],
    '{"sources": ["own_genius_portfolio", "own_genie_conversation_history"], "scopedTo": "learner_self", "citation": "Blueprint 14 Section Four, Agent One (Data access); Blueprint 02, Ownership and Trust principle."}'::jsonb,
    'claude-sonnet-5',
    5,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("agent_key") DO NOTHING;
