import { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

import { resolveMyGenieTier, type MyGenieTier } from "./my-genie-tool-gating";

/**
 * The write-once `AvatarConfiguration.voiceId` lock -- Architecture Spec
 * Part Four: "write-once, set at the Reveal and never updated by any later
 * Season or Turning process, application-layer and database-constrained
 * against modification after that first write." Part Five's thirteen-and-up
 * paragraph (Eleventh/Eighteenth/Nineteenth revision notes) and Blueprint 07
 * Part Six's parallel paragraph: the gate opens at thirteen; a Verifiable
 * Parental Consent (verifiable-parental-consent.ts) is required to activate
 * it, for every learner through age seventeen, worldwide.
 *
 * `activateVoiceLock` below is the literal enforcement Architecture Spec
 * Part Five asks for, "not a comment asserting it": four checks, each one
 * this task's own instruction names explicitly, run in order, and the write
 * itself happens exactly once per learner (see the module-level comment on
 * `AvatarConfiguration` in schema.prisma and the accompanying RLS migration
 * for the database-layer half of "write-once" -- `learnerUserId`'s own
 * `@unique` constraint, plus an INSERT grant with no general UPDATE
 * alongside it).
 *
 * `activateVoiceLock` is written against an injected `VoiceLockRepository`
 * rather than a real Prisma transaction directly, and `voice-lock-
 * activation.test.ts` exercises it against an in-memory fake, not a live
 * database. This is a deliberate architecture choice, not a stylistic one:
 * this build environment has no network path to the live Supabase database
 * (established since Phase 0 -- every prior phase's migrations were applied
 * through the Supabase MCP `apply_migration` tool for exactly this reason),
 * so no test in this repository has ever been able to exercise a real
 * Prisma call end to end, and this task's own instruction is explicit that
 * the write-once guarantee must be "the literal enforcement... not a
 * comment asserting it," proven by an actual test. The repository seam
 * makes that possible here for the first time this project has needed a
 * unit test for genuinely stateful, DB-backed enforcement logic -- it is
 * the same seam-and-stub pattern this project already uses for external
 * vendors (`SpeechToTextProvider`/`StubSpeechToTextProvider`,
 * `VerifiableParentalConsentProvider`/`StubVerifiableParentalConsentProvider`),
 * generalized one layer further to cover this module's own database reads
 * and writes. `createPrismaVoiceLockRepository` and
 * `activateVoiceLockForParent` at the bottom of this file are the thin
 * production adapter -- deliberately untested here, the same "adapter is
 * thin enough that the interesting logic sits entirely on the other side of
 * the seam" reasoning `runAsUser` itself has always relied on.
 */

export class LearnerMissingDateOfBirthError extends Error {
  constructor() {
    super("A learner's date of birth must be on file before My Genie's live-interaction tier can be resolved for them.");
    this.name = "LearnerMissingDateOfBirthError";
  }
}

export class NotThirteenPlusTierError extends Error {
  constructor(resolvedTier: MyGenieTier | null) {
    super(
      `The voice lock only activates for a learner in My Genie's THIRTEEN_PLUS tier (Architecture Spec Part Five, thirteen-and-up paragraph); this learner resolved to ${resolvedTier ?? "no tier at all"}.`,
    );
    this.name = "NotThirteenPlusTierError";
  }
}

export class NoVerifiedVoiceLockConsentError extends Error {
  constructor() {
    super(
      "No verified VerifiableParentalConsent record with purpose VOICE_LOCK_ACTIVATION exists for this learner (counsel's 2026-08-21 reply: Verifiable Parental Consent is required before the voice lock activates).",
    );
    this.name = "NoVerifiedVoiceLockConsentError";
  }
}

export class VoiceLockAlreadySetError extends Error {
  constructor() {
    super(
      "This learner's AvatarConfiguration.voiceId is already set. It is write-once, per Architecture Spec Part Four -- this call changes nothing.",
    );
    this.name = "VoiceLockAlreadySetError";
  }
}

/**
 * The same age-in-years computation src/modules/identity/onboard-learner.ts
 * already uses for its own `isMinor` check, reproduced here rather than
 * imported -- that function is local to its own module and not exported,
 * the same "each module owns its own small age helper" pattern
 * my-genie-tool-gating.ts already follows by taking a raw
 * `learnerAgeInYears` number as input rather than a `dateOfBirth`.
 */
export function ageInYearsAsOf(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

/** What `activateVoiceLock` needs from storage -- see this file's own top comment. */
export interface VoiceLockRepository {
  getLearnerDateOfBirth(learnerUserId: string): Promise<Date | null>;
  getMyGenieAgeThresholds(): Promise<{ minimumLearnerAge: number | null; voiceSynthesisMinimumAge: number | null }>;
  hasVerifiedVoiceLockConsent(learnerUserId: string): Promise<boolean>;
  hasExistingVoiceLock(learnerUserId: string): Promise<boolean>;
  createVoiceLock(params: { learnerUserId: string; voiceId: string; voiceIdSetAt: Date }): Promise<{ id: string }>;
}

/**
 * The four checks, in the order this task's own instruction names them.
 * Each one throws its own named error rather than a generic failure, so a
 * caller (and this file's own tests) can distinguish "wrong tier" from "no
 * consent" from "already locked" without parsing a message string.
 */
export async function activateVoiceLock({
  repository,
  learnerUserId,
  voiceId,
  now = new Date(),
}: {
  repository: VoiceLockRepository;
  learnerUserId: string;
  voiceId: string;
  now?: Date;
}): Promise<{ id: string }> {
  const dateOfBirth = await repository.getLearnerDateOfBirth(learnerUserId);
  if (!dateOfBirth) {
    throw new LearnerMissingDateOfBirthError();
  }

  const { minimumLearnerAge, voiceSynthesisMinimumAge } = await repository.getMyGenieAgeThresholds();
  const tier = resolveMyGenieTier({
    learnerAgeInYears: ageInYearsAsOf(dateOfBirth, now),
    minimumLearnerAge,
    voiceSynthesisMinimumAge,
  });
  if (tier !== "THIRTEEN_PLUS") {
    throw new NotThirteenPlusTierError(tier);
  }

  const hasConsent = await repository.hasVerifiedVoiceLockConsent(learnerUserId);
  if (!hasConsent) {
    throw new NoVerifiedVoiceLockConsentError();
  }

  const alreadyLocked = await repository.hasExistingVoiceLock(learnerUserId);
  if (alreadyLocked) {
    throw new VoiceLockAlreadySetError();
  }

  // Application-layer check above; the database-layer backstop for the
  // same TOCTOU race two concurrent activation attempts could otherwise
  // exploit is `learnerUserId`'s own `@unique` constraint on
  // `avatar_configurations` -- `createPrismaVoiceLockRepository` below maps
  // that constraint violation to this identical error class, so a caller
  // never has to distinguish "caught before writing" from "caught by the
  // database while writing."
  return repository.createVoiceLock({ learnerUserId, voiceId, voiceIdSetAt: now });
}

/** The production adapter -- thin, deliberately untested here (see this file's own top comment). */
function createPrismaVoiceLockRepository(tx: Prisma.TransactionClient): VoiceLockRepository {
  return {
    async getLearnerDateOfBirth(learnerUserId) {
      const learner = await tx.user.findUniqueOrThrow({
        where: { id: learnerUserId },
        select: { dateOfBirth: true },
      });
      return learner.dateOfBirth;
    },
    async getMyGenieAgeThresholds() {
      const myGenie = await tx.agentDefinition.findUniqueOrThrow({
        where: { agentKey: "my-genie" },
        select: { minimumLearnerAge: true, voiceSynthesisMinimumAge: true },
      });
      return myGenie;
    },
    async hasVerifiedVoiceLockConsent(learnerUserId) {
      const consent = await tx.verifiableParentalConsent.findFirst({
        where: { learnerUserId, purpose: "VOICE_LOCK_ACTIVATION", verified: true },
        select: { id: true },
      });
      return consent !== null;
    },
    async hasExistingVoiceLock(learnerUserId) {
      const existing = await tx.avatarConfiguration.findUnique({
        where: { learnerUserId },
        select: { id: true },
      });
      return existing !== null;
    },
    async createVoiceLock({ learnerUserId, voiceId, voiceIdSetAt }) {
      try {
        return await tx.avatarConfiguration.create({
          data: { learnerUserId, voiceId, voiceIdSetAt },
          select: { id: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new VoiceLockAlreadySetError();
        }
        throw error;
      }
    },
  };
}

/**
 * The real entrypoint -- runs as the consenting parent's own RLS-scoped
 * session (`runAsUser`), so the `avatar_configurations_insert_parent_voice_
 * lock` policy's own `app_actor_is_parent_of` check (accompanying RLS
 * migration) is live, not bypassed. Nothing in this codebase calls this yet
 * -- no consent UI, no Reveal ritual UI exists (this task's own non-goals)
 * -- it exists so the write-once guarantee is real, tested code, the same
 * "nothing in production calls it yet" relationship the 5-13 tier's own
 * stubbed STT path already has (this task's own consistency decision).
 */
export async function activateVoiceLockForParent({
  parentUserId,
  learnerUserId,
  voiceId,
}: {
  parentUserId: string;
  learnerUserId: string;
  voiceId: string;
}): Promise<{ id: string }> {
  return runAsUser(parentUserId, (tx) =>
    activateVoiceLock({ repository: createPrismaVoiceLockRepository(tx), learnerUserId, voiceId }),
  );
}
