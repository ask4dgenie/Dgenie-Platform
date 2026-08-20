-- Phase 2 -- schema DDL: community module, messaging module remainder,
-- events module. Mirrors ../../schema.prisma exactly. See that file's
-- per-model doc comments for the Architecture Spec Part / Blueprint 06
-- Part / Blueprint 08 Part citation behind each table. Applied via the
-- Supabase MCP `apply_migration` tool, same reason as every prior phase:
-- this build environment has no network path to the Supabase project.

-- ============================================================================
-- COMMUNITY MODULE -- Architecture Spec Part Four; Blueprint 06 Part Six
-- ============================================================================

CREATE TABLE "national_communities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "national_communities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "national_community_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "regions" ADD CONSTRAINT "regions_national_community_id_fkey" FOREIGN KEY ("national_community_id") REFERENCES "national_communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "circles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circles_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "circles" ADD CONSTRAINT "circles_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "circle_memberships" (
    "id" TEXT NOT NULL,
    "circle_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circle_memberships_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "circle_memberships_circle_id_left_at_idx" ON "circle_memberships"("circle_id", "left_at");
CREATE INDEX "circle_memberships_user_id_left_at_idx" ON "circle_memberships"("user_id", "left_at");
ALTER TABLE "circle_memberships" ADD CONSTRAINT "circle_memberships_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "circle_memberships" ADD CONSTRAINT "circle_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- MESSAGING MODULE -- remainder. Architecture Spec Part Four; Blueprint 08
-- Part Four Section Seven ("Communication System")
-- ============================================================================

CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "direct_messages_sender_user_id_idx" ON "direct_messages"("sender_user_id");
CREATE INDEX "direct_messages_recipient_user_id_idx" ON "direct_messages"("recipient_user_id");
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "circle_messages" (
    "id" TEXT NOT NULL,
    "circle_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "circle_messages_circle_id_idx" ON "circle_messages"("circle_id");
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- EVENTS MODULE -- four rhythms. Blueprint 06 Part Five ("Community Life")
-- ============================================================================

CREATE TABLE "morning_sparks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "authored_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "morning_sparks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "morning_sparks_scheduled_for_key" ON "morning_sparks"("scheduled_for");
ALTER TABLE "morning_sparks" ADD CONSTRAINT "morning_sparks_authored_by_user_id_fkey" FOREIGN KEY ("authored_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "CommunityEventStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "circle_times" (
    "id" TEXT NOT NULL,
    "circle_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "CommunityEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circle_times_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "circle_times_circle_id_scheduled_for_idx" ON "circle_times"("circle_id", "scheduled_for");
ALTER TABLE "circle_times" ADD CONSTRAINT "circle_times_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "gatherings" (
    "id" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "CommunityEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gatherings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gatherings_region_id_scheduled_for_idx" ON "gatherings"("region_id", "scheduled_for");
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "RecognitionCategory" AS ENUM ('GENIUS_LEVEL_ADVANCEMENT', 'SERVICE', 'CHARACTER');

CREATE TABLE "recognition_nights" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "circle_id" TEXT NOT NULL,
    "category" "RecognitionCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "recognized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recognized_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_nights_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recognition_nights_learner_user_id_idx" ON "recognition_nights"("learner_user_id");
CREATE INDEX "recognition_nights_circle_id_recognized_at_idx" ON "recognition_nights"("circle_id", "recognized_at");
ALTER TABLE "recognition_nights" ADD CONSTRAINT "recognition_nights_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recognition_nights" ADD CONSTRAINT "recognition_nights_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recognition_nights" ADD CONSTRAINT "recognition_nights_recognized_by_user_id_fkey" FOREIGN KEY ("recognized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- AUDIT LOG -- two new event types for this phase's own workflows
-- ============================================================================

ALTER TYPE "AuditEventType" ADD VALUE 'FAMILY_CONNECTED_TO_CIRCLE';
ALTER TYPE "AuditEventType" ADD VALUE 'MENTOR_CERTIFIED';
