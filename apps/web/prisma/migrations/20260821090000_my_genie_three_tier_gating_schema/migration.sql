-- Three-tier My Genie live-interaction gate -- schema DDL. Mirrors
-- ../../schema.prisma exactly. See the `voiceSynthesisMinimumAge` and
-- `AvatarConfiguration` doc comments there for the full Architecture Spec
-- Part Five / Blueprint 07 Part Six citations. Applied via the Supabase MCP
-- `apply_migration` tool, same reason as every prior phase: this build
-- environment has no network path to the Supabase project.

ALTER TABLE "agent_definitions" ADD COLUMN "voice_synthesis_minimum_age" INTEGER;

CREATE TABLE "avatar_configurations" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "voice_id" TEXT,
    "voice_id_set_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatar_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "avatar_configurations_learner_user_id_key" ON "avatar_configurations"("learner_user_id");
ALTER TABLE "avatar_configurations" ADD CONSTRAINT "avatar_configurations_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
