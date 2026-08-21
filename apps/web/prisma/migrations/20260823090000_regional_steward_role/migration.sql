-- Partial Mentor Control Tower -- Blueprint 08 Part One, Section Three.
-- Adds REGIONAL_STEWARD, the constitutional office that instrument
-- belongs to; this codebase's RoleType enum previously held Blueprint 08
-- Part Four Section Five's fifteen operational roles only. See schema.
-- prisma's own doc comment on RoleType for the full citation. Applied via
-- the Supabase MCP `apply_migration` tool, same reason as every prior
-- phase: this build environment has no network path to the Supabase
-- project.

ALTER TYPE "RoleType" ADD VALUE 'REGIONAL_STEWARD';
