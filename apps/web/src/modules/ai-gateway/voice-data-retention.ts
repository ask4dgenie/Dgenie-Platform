import type { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

/**
 * The one-year retention/destruction floor -- Architecture Spec Part Five,
 * thirteen-and-up paragraph (Nineteenth revision note, quoting counsel's
 * 2026-08-21 reply directly): "'Lifelong companion' must mean 'for the life
 * of the active account,' with a defined, disclosed deletion trigger, not
 * true indefinite retention... Duncan confirmed the identical one-year-
 * since-account-closure-or-last-interaction floor already governing
 * Birthday Voice Memento's 13+ audio, so the platform has one retention
 * standard for retained minor voice data rather than two." Blueprint 07
 * Part Six's parallel paragraph states the same floor.
 *
 * Built as a small, generic module deliberately, per this task's own
 * instruction: "Birthday Voice Memento's own thirteen-and-up recording
 * needs the identical rule once its own task is scoped, and shouldn't
 * reimplement it independently." `computeDataDestructionDate` is a pure
 * function of two dates, tied to no table; `DestructionTarget` and
 * `destroyDataForLearner` are a small, generic runner over a list of
 * per-table clearing actions, not a function hardcoded to clear exactly
 * `AvatarConfiguration` and nothing else. A future Birthday Voice Memento
 * task reuses both without touching this file -- it defines its own
 * `DestructionTarget` for `BirthdayVoiceMemento` and passes it alongside
 * (or instead of) `THIRTEEN_PLUS_TIER_VOICE_DESTRUCTION_TARGETS` below.
 *
 * No scheduled job calls any of this yet -- this task's own non-goals:
 * "there is no live pipeline yet producing real data for a job to destroy,
 * and wiring one now is operational surface for nothing." Every function
 * here is callable and tested directly, nothing more.
 */

export class MissingDestructionBasisError extends Error {
  constructor() {
    super(
      "computeDataDestructionDate requires at least one of accountClosedAt or lastRecordedInteractionAt to compute a destruction date from.",
    );
    this.name = "MissingDestructionBasisError";
  }
}

/**
 * Part Two's own language, reproduced in this module's design: "the
 * destruction date is one year after account closure once formal closure
 * happens; short of that, it's one year after the account's last recorded
 * interaction, a date that slides forward with ordinary use -- an actively
 * enrolled family never actually reaches it." `accountClosedAt`, once set,
 * always wins over `lastRecordedInteractionAt` -- formal closure is the
 * authoritative trigger the moment it exists, per that same text ("once
 * formal closure happens"), regardless of how recently the account was
 * otherwise used.
 *
 * Uses `Date#setFullYear` rather than millisecond arithmetic so leap years
 * are handled the way a calendar actually works (one year after February
 * 29 is March 1 the following non-leap year, not a date computed from a
 * fixed 365/366-day offset).
 */
export function computeDataDestructionDate({
  accountClosedAt,
  lastRecordedInteractionAt,
}: {
  accountClosedAt: Date | null;
  lastRecordedInteractionAt: Date | null;
}): Date {
  const basis = accountClosedAt ?? lastRecordedInteractionAt;
  if (!basis) {
    throw new MissingDestructionBasisError();
  }

  const destructionDate = new Date(basis);
  destructionDate.setFullYear(destructionDate.getFullYear() + 1);
  return destructionDate;
}

/** What a destruction pass needs from storage -- see this file's own top comment on the repository-injection pattern. */
export interface VoiceDataDestructionRepository {
  clearAvatarConfigurationVoice(learnerUserId: string): Promise<void>;
}

/**
 * One named, independently testable clearing step. `destroy` receives the
 * repository rather than reaching for a global Prisma client, the same
 * seam voice-lock-activation.ts uses and for the identical reason: this
 * build environment has no network path to the live database, so anything
 * this project writes a real test for has to be testable without one.
 */
export interface DestructionTarget {
  readonly name: string;
  destroy(repository: VoiceDataDestructionRepository, learnerUserId: string): Promise<void>;
}

/**
 * Clears the write-once voice lock -- Architecture Spec Part Five: "the
 * locked voiceprint for a learner in this tier are retained only for the
 * life of the account, destroyed within one year of account closure or of
 * the account's last recorded interaction, whichever occurs first." This is
 * the one already-real column this task's own `AvatarConfiguration` write
 * path (voice-lock-activation.ts) can set, so it is the one this target
 * actually clears.
 */
export const avatarConfigurationVoiceDestructionTarget: DestructionTarget = {
  name: "avatar_configuration_voice",
  async destroy(repository, learnerUserId) {
    await repository.clearAvatarConfigurationVoice(learnerUserId);
  },
};

/**
 * The same Architecture Spec Part Five sentence quoted above also names
 * `GenieMemory` alongside the voiceprint: "`GenieMemory` and the locked
 * voiceprint for a learner in this tier are retained only for the life of
 * the account." This target exists so that sentence has a real
 * `DestructionTarget` covering it, and so `destroyDataForLearner`'s own
 * caller list (`THIRTEEN_PLUS_TIER_VOICE_DESTRUCTION_TARGETS` below) is
 * complete against what Part Five actually says needs clearing.
 *
 * Its body is a documented no-op today: `GenieMemory` (schema.prisma) has
 * no content field yet at all -- that model's own doc comment explains why
 * ("inventing a memory shape ahead of the live My Genie pipeline that will
 * actually populate it... risks guessing wrong"), a decision this task does
 * not reopen. There is, today, nothing on that row to clear beyond its own
 * existence, and deleting the row itself is a different, larger decision
 * (whether a learner keeps a GenieMemory row at all after destruction, as
 * opposed to an emptied one) this task was not asked to make. Once a real
 * pipeline gives `GenieMemory` an actual content shape, this function's
 * body is where that content gets cleared -- not a new destruction
 * entrypoint layered on top of this one.
 */
export const genieMemoryContentDestructionTarget: DestructionTarget = {
  name: "genie_memory_content",
  async destroy() {
    // Intentionally empty -- see this constant's own doc comment above.
  },
};

export const THIRTEEN_PLUS_TIER_VOICE_DESTRUCTION_TARGETS: readonly DestructionTarget[] = [
  avatarConfigurationVoiceDestructionTarget,
  genieMemoryContentDestructionTarget,
];

/** Runs every target in order against one learner. Not table-specific -- see this file's own top comment. */
export async function destroyDataForLearner({
  repository,
  learnerUserId,
  targets,
}: {
  repository: VoiceDataDestructionRepository;
  learnerUserId: string;
  targets: readonly DestructionTarget[];
}): Promise<void> {
  for (const target of targets) {
    await target.destroy(repository, learnerUserId);
  }
}

/** The production adapter -- thin, deliberately untested here (see this file's own top comment). */
function createPrismaVoiceDataDestructionRepository(tx: Prisma.TransactionClient): VoiceDataDestructionRepository {
  return {
    async clearAvatarConfigurationVoice(learnerUserId) {
      // updateMany, not update -- a learner who never activated the voice
      // lock has no AvatarConfiguration row at all, and this call must be a
      // harmless no-op for them, not a "record not found" error. The
      // accompanying RLS migration's UPDATE policy WITH CHECKs the
      // resulting row's voice_id back to null, the same "an UPDATE may only
      // ever clear this column, never set it" guarantee described on the
      // `AvatarConfiguration.voiceId` field itself in schema.prisma.
      await tx.avatarConfiguration.updateMany({
        where: { learnerUserId },
        data: { voiceId: null, voiceIdSetAt: null },
      });
    },
  };
}

/**
 * The real entrypoint. Runs as an Administrator's own RLS-scoped session --
 * data destruction is treated as the same kind of administrative/compliance
 * action New Parent and New Mentor Certification already are elsewhere in
 * this project ("Human-only, Administrator-run"), not a parent or learner
 * self-service action. Nothing in this codebase calls this yet, per this
 * task's own non-goals (no scheduled job wiring) -- it exists so the
 * retention floor's destruction half is real, tested code, ready for
 * whichever future task adds the job that actually calls it on a schedule.
 */
export async function destroyThirteenPlusTierVoiceDataForLearner({
  administratorUserId,
  learnerUserId,
  targets = THIRTEEN_PLUS_TIER_VOICE_DESTRUCTION_TARGETS,
}: {
  administratorUserId: string;
  learnerUserId: string;
  targets?: readonly DestructionTarget[];
}): Promise<void> {
  return runAsUser(administratorUserId, (tx) =>
    destroyDataForLearner({
      repository: createPrismaVoiceDataDestructionRepository(tx),
      learnerUserId,
      targets,
    }),
  );
}
