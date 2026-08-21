-- VerifiableParentalConsent -- Architecture Spec Part Five, thirteen-and-up
-- paragraph (Nineteenth revision note) and Blueprint 07 Part Six's parallel
-- paragraph, both quoting counsel's 2026-08-21 reply: "Verifiable Parental
-- Consent is required before collection... DGENIE needs one of the more
-- rigorous FTC-approved methods." See schema.prisma's own doc comments on
-- this model and its two enums for the full citations. Applied via the
-- Supabase MCP `apply_migration` tool, same reason as every prior phase:
-- this build environment has no network path to the Supabase project.

CREATE TYPE "VerifiableParentalConsentPurpose" AS ENUM ('VOICE_LOCK_ACTIVATION');

CREATE TYPE "VerifiableParentalConsentMethod" AS ENUM (
    'KNOWLEDGE_BASED_AUTHENTICATION',
    'PAYMENT_CARD_TRANSACTION',
    'GOVERNMENT_ID_FACIAL_RECOGNITION'
);

CREATE TABLE "verifiable_parental_consents" (
    "id" TEXT NOT NULL,
    "parent_user_id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "purpose" "VerifiableParentalConsentPurpose" NOT NULL,
    "method" "VerifiableParentalConsentMethod" NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "disclosure_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifiable_parental_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verifiable_parental_consents_learner_user_id_purpose_idx" ON "verifiable_parental_consents"("learner_user_id", "purpose");

ALTER TABLE "verifiable_parental_consents" ADD CONSTRAINT "verifiable_parental_consents_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verifiable_parental_consents" ADD CONSTRAINT "verifiable_parental_consents_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
