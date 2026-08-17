import type { Prisma } from "@prisma/client";

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
 * Finds the first active Mentor Role with capacity under the ceiling above.
 * Architecture Spec Part Seven Workflow 1: an Administrator "assigns a first
 * Mentor from available caseload capacity." A simple first-fit search, not a
 * load-balancing algorithm -- nothing in this slice's scope asks for one.
 *
 * Takes an already-open transaction client so it composes inside a larger
 * workflow transaction (see onboard-learner.ts) as well as running
 * standalone (`findMentorWithCapacity` below).
 */
export async function findMentorWithCapacityTx(
  tx: Prisma.TransactionClient,
): Promise<{ mentorRoleId: string; mentorUserId: string } | null> {
  const mentorRoles = await tx.role.findMany({
    where: { roleType: "MENTOR", validTo: null },
    select: { id: true, userId: true },
  });

  for (const mentorRole of mentorRoles) {
    const activeCaseload = await tx.mentorAssignment.count({
      where: { mentorRoleId: mentorRole.id, validTo: null },
    });
    if (activeCaseload < MENTOR_CASELOAD_CEILING) {
      return { mentorRoleId: mentorRole.id, mentorUserId: mentorRole.userId };
    }
  }
  return null;
}

export async function findMentorWithCapacity(administratorUserId: string) {
  return runAsUser(administratorUserId, (tx) => findMentorWithCapacityTx(tx));
}

/**
 * Assigns a Mentor to a learner. Architecture Spec Part Seven Workflow 1;
 * Blueprint 11's caseload ceiling. Enforced twice, per Part Six's "two
 * layers, not one": this application-layer pre-check, and the
 * `mentor_assignments_insert_ceiling` RLS policy (prisma/migrations/
 * 20260818090100_phase1_slice_a_rls_and_grants) that refuses the insert at
 * the database layer regardless of what this function does or doesn't check.
 *
 * Modeled with the same validity-window discipline as `Role` (`validFrom`/
 * `validTo`, never overwritten) -- see the `MentorAssignment` model's own
 * doc comment in schema.prisma for why.
 *
 * Takes an already-open transaction client so it composes inside New Learner
 * Onboarding's own transaction (onboard-learner.ts) rather than opening a
 * second, separate one -- onboarding needs the User creation and the Mentor
 * assignment to succeed or fail together, per Workflow 1's own text that a
 * learner never begins without an active Mentor relationship.
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
    where: { mentorRoleId, validTo: null },
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
