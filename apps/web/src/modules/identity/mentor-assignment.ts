import type { FaithBackground, Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

/**
 * Blueprint 11, "Mentor caseload ceiling": "A Mentor holds no more than
 * twenty assigned learners at once, combined across both tracks rather than
 * twenty per track." A headcount, not a payment calculation -- this does not
 * require and is not gated on the `compensation` module.
 */
export const MENTOR_CASELOAD_CEILING = 20;

export class MentorCaseloadFullError extends Error {
  constructor(mentorRoleId: string) {
    super(`Mentor role ${mentorRoleId} already holds ${MENTOR_CASELOAD_CEILING} active learners.`);
    this.name = "MentorCaseloadFullError";
  }
}

export class MentorRoleInvalidError extends Error {
  constructor(mentorRoleId: string) {
    super(`Role ${mentorRoleId} is not an active MENTOR role.`);
    this.name = "MentorRoleInvalidError";
  }
}

/**
 * Finds an active Mentor Role with capacity under the ceiling above.
 * Architecture Spec Part Seven Workflow 1: an Administrator "assigns a first
 * Mentor from available caseload capacity." A simple first-fit search, not a
 * load-balancing algorithm -- nothing in this slice's scope asks for one.
 *
 * `excludeCaseloadForLearnerUserId` (added for the Mentor rotation task):
 * when a search runs on behalf of a learner who already has an active
 * `MentorAssignment` (only true for a rotation's own incoming-Mentor search
 * -- a first-time New Learner Onboarding search never sets this, since that
 * learner has no assignment history yet), that learner's own currently-
 * active row is excluded from each candidate's caseload count, the same
 * correction `assignMentorTx` below makes for the identical reason: a
 * renewal (the same Mentor as a candidate) changes that Mentor's real
 * caseload by zero, not by one, and must not be undercounted as "full" on
 * that account.
 *
 * `faithBackgroundPreference` (added for the Mentor rotation task, Blueprint
 * 11 Section Four; Blueprint 12 Section Five): honored, never required. If
 * one or more candidates with capacity share the requested background, the
 * first such candidate is returned; otherwise the search falls back to the
 * first candidate with capacity regardless of background, exactly Blueprint
 * 11 Section Four's own words: "a family that hasn't requested the match is
 * never assigned as though they had" -- and, symmetrically, a family that
 * has requested it is never left without a Mentor because no matching
 * Mentor currently has room. This is a preference among otherwise-eligible
 * candidates, never a filter that removes a candidate from eligibility.
 *
 * Takes an already-open transaction client so it composes inside a larger
 * workflow transaction (see onboard-learner.ts and mentor-rotation.ts) as
 * well as running standalone (`findMentorWithCapacity` below).
 */
export async function findMentorWithCapacityTx(
  tx: Prisma.TransactionClient,
  options: {
    excludeCaseloadForLearnerUserId?: string;
    faithBackgroundPreference?: FaithBackground | null;
  } = {},
): Promise<{ mentorRoleId: string; mentorUserId: string } | null> {
  const mentorRoles = await tx.role.findMany({
    where: { roleType: "MENTOR", validTo: null },
    select: { id: true, userId: true, mentorFaithBackground: true },
  });

  const candidatesWithCapacity: Array<{
    mentorRoleId: string;
    mentorUserId: string;
    mentorFaithBackground: FaithBackground | null;
  }> = [];

  for (const mentorRole of mentorRoles) {
    const activeCaseload = await tx.mentorAssignment.count({
      where: {
        mentorRoleId: mentorRole.id,
        validTo: null,
        ...(options.excludeCaseloadForLearnerUserId
          ? { learnerUserId: { not: options.excludeCaseloadForLearnerUserId } }
          : {}),
      },
    });
    if (activeCaseload < MENTOR_CASELOAD_CEILING) {
      candidatesWithCapacity.push({
        mentorRoleId: mentorRole.id,
        mentorUserId: mentorRole.userId,
        mentorFaithBackground: mentorRole.mentorFaithBackground,
      });
    }
  }

  if (candidatesWithCapacity.length === 0) {
    return null;
  }

  if (options.faithBackgroundPreference) {
    const matching = candidatesWithCapacity.find(
      (candidate) => candidate.mentorFaithBackground === options.faithBackgroundPreference,
    );
    if (matching) {
      return { mentorRoleId: matching.mentorRoleId, mentorUserId: matching.mentorUserId };
    }
  }

  const first = candidatesWithCapacity[0];
  return { mentorRoleId: first.mentorRoleId, mentorUserId: first.mentorUserId };
}

export async function findMentorWithCapacity(
  administratorUserId: string,
  options?: { excludeCaseloadForLearnerUserId?: string; faithBackgroundPreference?: FaithBackground | null },
) {
  return runAsUser(administratorUserId, (tx) => findMentorWithCapacityTx(tx, options));
}

/**
 * Assigns a Mentor to a learner. Architecture Spec Part Seven Workflow 1;
 * Blueprint 11's caseload ceiling. Enforced twice, per Part Six's "two
 * layers, not one": this application-layer pre-check, and the
 * `mentor_assignments_insert_ceiling` RLS policy (prisma/migrations/
 * 20260818090100_phase1_slice_a_rls_and_grants, corrected for the Mentor
 * rotation task below) that refuses the insert at the database layer
 * regardless of what this function does or doesn't check.
 *
 * Modeled with the same validity-window discipline as `Role` (`validFrom`/
 * `validTo`, never overwritten) -- see the `MentorAssignment` model's own
 * doc comment in schema.prisma for why.
 *
 * The caseload count excludes this same learner's own currently-active
 * assignment, if one exists (added for the Mentor rotation task,
 * mentor-rotation.ts) -- a plain new assignment never has one, so this
 * changes nothing for New Learner Onboarding's own call below; a rotation's
 * renewal path (the incoming Mentor Role equal to the outgoing one) does
 * have one, and counting it would double-count the same learner-Mentor
 * relationship against the ceiling for a call that changes that Mentor's
 * real caseload by zero. See the `MentorAssignment` model's own doc comment
 * in schema.prisma for the fuller reasoning, mirrored in the accompanying
 * RLS migration's own correction to `mentor_assignments_insert_ceiling`.
 *
 * Takes an already-open transaction client so it composes inside New Learner
 * Onboarding's own transaction (onboard-learner.ts) and the Mentor rotation
 * task's own transaction (mentor-rotation.ts) rather than opening a second,
 * separate one -- both need the wider workflow's other writes to succeed or
 * fail together with this one.
 */
export async function assignMentorTx(
  tx: Prisma.TransactionClient,
  {
    administratorUserId,
    learnerUserId,
    mentorRoleId,
  }: { administratorUserId: string; learnerUserId: string; mentorRoleId: string },
) {
  const mentorRole = await tx.role.findFirst({
    where: { id: mentorRoleId, roleType: "MENTOR", validTo: null },
  });
  if (!mentorRole) {
    throw new MentorRoleInvalidError(mentorRoleId);
  }

  const activeCaseload = await tx.mentorAssignment.count({
    where: { mentorRoleId, validTo: null, learnerUserId: { not: learnerUserId } },
  });
  if (activeCaseload >= MENTOR_CASELOAD_CEILING) {
    throw new MentorCaseloadFullError(mentorRoleId);
  }

  const assignment = await tx.mentorAssignment.create({
    data: { learnerUserId, mentorRoleId, assignedByUserId: administratorUserId },
  });

  await tx.auditLogEntry.create({
    data: {
      eventType: "MENTOR_ASSIGNED",
      actorUserId: administratorUserId,
      targetUserId: learnerUserId,
      summary: "Mentor assigned to learner via New Learner Onboarding (Architecture Spec Part Seven, Workflow 1).",
      metadata: { mentorRoleId, mentorAssignmentId: assignment.id } satisfies Prisma.InputJsonValue,
    },
  });

  return assignment;
}

export async function assignMentor(params: {
  administratorUserId: string;
  learnerUserId: string;
  mentorRoleId: string;
}) {
  return runAsUser(params.administratorUserId, (tx) => assignMentorTx(tx, params));
}
