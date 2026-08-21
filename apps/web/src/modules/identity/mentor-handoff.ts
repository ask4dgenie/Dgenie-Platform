import type { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

import { isMinor } from "./onboard-learner";

/**
 * The handoff record itself -- Blueprint 07 Part Five's "Planned Mentor
 * rotation and handoff" standard: "The handoff itself runs as a structured
 * conversation, modeled on Blueprint 04's Transition Conversation format
 * and adapted here for an institution-initiated event rather than a
 * learner-initiated one... held jointly by the outgoing Mentor, the
 * incoming Mentor, and the learner, with the family included where
 * age-appropriate per Part Four."
 *
 * See the `MentorHandoff` model's own doc comment in schema.prisma for why
 * this is a named stand-in for Blueprint 04's general Transition
 * Conversation entity, not a claim of building that entity -- it has no
 * table or module anywhere in this codebase, and that gap is real, separate,
 * unscoped work.
 */

export class LearnerMissingDateOfBirthError extends Error {
  constructor() {
    super("A learner's date of birth must be on file to compute this handoff's family-inclusion flag.");
    this.name = "LearnerMissingDateOfBirthError";
  }
}

export class NotNamedMentorError extends Error {
  constructor() {
    super("Only the outgoing or incoming Mentor named on this handoff may act on it.");
    this.name = "NotNamedMentorError";
  }
}

export class HandoffNotFoundError extends Error {
  constructor(handoffId: string) {
    super(`MentorHandoff ${handoffId} does not exist.`);
    this.name = "HandoffNotFoundError";
  }
}

export class HandoffAlreadyCompleteError extends Error {
  constructor(handoffId: string) {
    super(`MentorHandoff ${handoffId} is already complete -- the write window Part Five's own record describes has closed.`);
    this.name = "HandoffAlreadyCompleteError";
  }
}

export class IncompleteHandoffContentError extends Error {
  constructor() {
    super(
      "Completing a handoff requires all three content fields Blueprint 07 Part Five names: what's worth carrying forward, what's currently in progress, and what the learner should expect.",
    );
    this.name = "IncompleteHandoffContentError";
  }
}

/**
 * Schedules a handoff -- Part Five: "It is scheduled with real advance
 * notice once a rotation date is known, never sprung on the day a term
 * ends." Content fields are deliberately not accepted here; they exist
 * only from `completeMentorHandoff` onward, once the conversation this
 * record schedules has actually happened.
 *
 * `familyIncluded` is computed once, here, from the learner's own age at
 * scheduling time, via `isMinor` (src/modules/identity/onboard-learner.ts)
 * -- reused rather than reinvented, per this task's own instruction, the
 * same threshold this codebase already uses to decide whether a
 * `ParentLink` is required at all. Part Five's own "with the family
 * included where age-appropriate per Part Four" is read here as "the
 * learner is a minor," the same reading that already gives a family
 * standing at all in this schema (an adult learner has no `ParentLink`
 * governing them the same way).
 *
 * Runs as the scheduling Mentor's own RLS-scoped session; an application-
 * layer check confirms that Mentor is genuinely the outgoing or incoming
 * Role named on this handoff, mirrored at the database layer by the
 * accompanying `mentor_handoffs_insert` RLS policy's identical check, per
 * Architecture Spec Part Six's "two layers, not one."
 */
export async function scheduleMentorHandoff({
  schedulingUserId,
  learnerUserId,
  outgoingMentorRoleId,
  incomingMentorRoleId,
  scheduledFor,
}: {
  schedulingUserId: string;
  learnerUserId: string;
  outgoingMentorRoleId: string;
  incomingMentorRoleId: string;
  scheduledFor: Date;
}) {
  return runAsUser(schedulingUserId, async (tx) => {
    const actingRole = await tx.role.findFirst({
      where: { userId: schedulingUserId, id: { in: [outgoingMentorRoleId, incomingMentorRoleId] } },
      select: { id: true },
    });
    if (!actingRole) {
      throw new NotNamedMentorError();
    }

    const learner = await tx.user.findUniqueOrThrow({
      where: { id: learnerUserId },
      select: { dateOfBirth: true },
    });
    if (!learner.dateOfBirth) {
      throw new LearnerMissingDateOfBirthError();
    }

    const familyIncluded = isMinor(learner.dateOfBirth);

    const handoff = await tx.mentorHandoff.create({
      data: { learnerUserId, outgoingMentorRoleId, incomingMentorRoleId, scheduledFor, familyIncluded },
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "MENTOR_HANDOFF_SCHEDULED",
        actorUserId: schedulingUserId,
        targetUserId: learnerUserId,
        summary: "Mentor handoff scheduled, per Blueprint 07 Part Five's advance-notice requirement.",
        metadata: {
          handoffId: handoff.id,
          outgoingMentorRoleId,
          incomingMentorRoleId,
          scheduledFor: scheduledFor.toISOString(),
          familyIncluded,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return handoff;
  });
}

/**
 * Pure. Refuses a completion attempt carrying a blank or whitespace-only
 * value for any of Part Five's three named content fields -- a real
 * conversation report, not a bare confirmation click, the same "requires a
 * citation of specific evidence, not a bare approval" discipline
 * certify-genius-level.ts already applies to Genius Level Certification.
 */
export function validateHandoffCompletionContent({
  carryForwardNotes,
  inProgressNotes,
  expectationsForLearner,
}: {
  carryForwardNotes: string;
  inProgressNotes: string;
  expectationsForLearner: string;
}): void {
  const isBlank = (value: string) => value.trim().length === 0;
  if (isBlank(carryForwardNotes) || isBlank(inProgressNotes) || isBlank(expectationsForLearner)) {
    throw new IncompleteHandoffContentError();
  }
}

/**
 * Completes a handoff, filling in Part Five's three content fields and
 * closing the write window: the accompanying `mentor_handoffs_update` RLS
 * policy's own `USING (completed_at IS NULL)` clause (mirrored by this
 * function's own pre-check) refuses any further write to this row once
 * `completedAt` is set, at both layers, per Part Six's "two layers, not
 * one."
 */
export async function completeMentorHandoff({
  completingUserId,
  handoffId,
  carryForwardNotes,
  inProgressNotes,
  expectationsForLearner,
}: {
  completingUserId: string;
  handoffId: string;
  carryForwardNotes: string;
  inProgressNotes: string;
  expectationsForLearner: string;
}) {
  validateHandoffCompletionContent({ carryForwardNotes, inProgressNotes, expectationsForLearner });

  return runAsUser(completingUserId, async (tx) => {
    const existing = await tx.mentorHandoff.findUnique({
      where: { id: handoffId },
      select: { id: true, learnerUserId: true, completedAt: true, outgoingMentorRoleId: true, incomingMentorRoleId: true },
    });
    if (!existing) {
      throw new HandoffNotFoundError(handoffId);
    }
    if (existing.completedAt) {
      throw new HandoffAlreadyCompleteError(handoffId);
    }

    const actingRole = await tx.role.findFirst({
      where: {
        userId: completingUserId,
        id: { in: [existing.outgoingMentorRoleId, existing.incomingMentorRoleId] },
      },
      select: { id: true },
    });
    if (!actingRole) {
      throw new NotNamedMentorError();
    }

    const completed = await tx.mentorHandoff.update({
      where: { id: handoffId },
      data: { carryForwardNotes, inProgressNotes, expectationsForLearner, completedAt: new Date() },
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "MENTOR_HANDOFF_COMPLETED",
        actorUserId: completingUserId,
        targetUserId: existing.learnerUserId,
        summary: "Mentor handoff completed, per Blueprint 07 Part Five.",
        metadata: { handoffId } satisfies Prisma.InputJsonValue,
      },
    });

    return completed;
  });
}
