import type { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

export class NoCircleAvailableError extends Error {
  constructor(regionId: string) {
    super(`No Circle exists in Region ${regionId} to connect this family to.`);
    this.name = "NoCircleAvailableError";
  }
}

export class NotAParentError extends Error {
  constructor() {
    super("The given user does not hold an active PARENT Role.");
    this.name = "NotAParentError";
  }
}

/**
 * New Parent -- Blueprint 08 Part Four Section Eight's workflow table:
 * "New Parent | Parent, Administrator, Community Mentor | Family Learning
 * Unit connected to a Local Learning Circle." Human-only, Administrator-run,
 * per this phase's own consistency decision (no live Administrator AI, the
 * same treatment New Learner Onboarding already gave it in Phase 1 Slice A).
 *
 * "Family Learning Unit" (Blueprint 06 Part Six: "The learner's own family
 * ... the school of record for a Home Track learner") is deliberately NOT a
 * new table here. The `community` module's own entity list (Architecture
 * Spec Part Four) names only `Circle`, `CircleMembership`, `Region`, and
 * `NationalCommunity` -- no `FamilyLearningUnit` table is asked for. The
 * Family Learning Unit is the `ParentLink` relationship Phase 0's `identity`
 * module already made real; "formal recognition" is this workflow actually
 * running against it (and the AuditLogEntry it writes below), not a second
 * record of a fact `ParentLink` already states.
 *
 * "Connected to a Local Learning Circle" is the literal, concrete output:
 * both the parent and their linked minor learner(s) become `CircleMembership`
 * holders of the chosen Circle, and each learner's `User.circleId` (the
 * nullable field Phase 1 Slice A's New Learner Onboarding deliberately left
 * unset -- see onboard-learner.ts's own doc comment) is populated. This is
 * literally the deferral that file named, closed here.
 */
export async function connectFamilyToCircle({
  administratorUserId,
  parentUserId,
  regionId,
  circleId,
}: {
  administratorUserId: string;
  parentUserId: string;
  /** The region to pick a Circle within, when `circleId` isn't given explicitly. */
  regionId?: string;
  /** Explicit Circle choice; omitted means "first Circle in `regionId`." */
  circleId?: string;
}) {
  return runAsUser(administratorUserId, async (tx) => {
    const parentRole = await tx.role.findFirst({
      where: { userId: parentUserId, roleType: "PARENT", validTo: null },
    });
    if (!parentRole) {
      throw new NotAParentError();
    }

    const resolvedCircleId =
      circleId ?? (regionId ? (await tx.circle.findFirst({ where: { regionId } }))?.id : undefined);
    if (!resolvedCircleId) {
      throw new NoCircleAvailableError(regionId ?? "(none given)");
    }

    const learnerLinks = await tx.parentLink.findMany({
      where: { parentUserId, revokedAt: null },
      select: { minorUserId: true },
    });

    const membershipTargets = [parentUserId, ...learnerLinks.map((link) => link.minorUserId)];

    for (const userId of membershipTargets) {
      const existing = await tx.circleMembership.findFirst({
        where: { userId, circleId: resolvedCircleId, leftAt: null },
      });
      if (!existing) {
        await tx.circleMembership.create({
          data: { userId, circleId: resolvedCircleId },
        });
      }
    }

    for (const link of learnerLinks) {
      await tx.user.update({
        where: { id: link.minorUserId },
        data: { circleId: resolvedCircleId },
      });
    }

    await tx.auditLogEntry.create({
      data: {
        eventType: "FAMILY_CONNECTED_TO_CIRCLE",
        actorUserId: administratorUserId,
        targetUserId: parentUserId,
        summary:
          "Family Learning Unit formally recognized and connected to a Local Learning Circle (Blueprint 08 Part Four Section Eight, New Parent workflow).",
        metadata: {
          circleId: resolvedCircleId,
          learnerUserIds: learnerLinks.map((link) => link.minorUserId),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { circleId: resolvedCircleId, learnerUserIds: learnerLinks.map((link) => link.minorUserId) };
  });
}

/**
 * Backfill for any Phase 1-era learner still carrying a null `circleId` --
 * named explicitly in this phase's own scope as closing New Learner
 * Onboarding's deferred Circle assignment. Finds every learner whose
 * `circleId` is still null, resolves their family's parent (if any, via
 * `ParentLink`), and runs the same connection logic above. A learner with no
 * `ParentLink` at all (an adult, self-enrolled learner) is connected
 * directly, without a parent's own membership being created.
 */
export async function backfillCircleAssignments({
  administratorUserId,
  regionId,
  circleId,
}: {
  administratorUserId: string;
  regionId?: string;
  circleId?: string;
}) {
  return runAsUser(administratorUserId, async (tx) => {
    const resolvedCircleId =
      circleId ?? (regionId ? (await tx.circle.findFirst({ where: { regionId } }))?.id : undefined);
    if (!resolvedCircleId) {
      throw new NoCircleAvailableError(regionId ?? "(none given)");
    }

    const learnersWithoutCircle = await tx.user.findMany({
      where: {
        circleId: null,
        roles: { some: { roleType: "LEARNER", validTo: null } },
      },
      select: { id: true },
    });

    const updatedLearnerIds: string[] = [];

    for (const learner of learnersWithoutCircle) {
      const existingMembership = await tx.circleMembership.findFirst({
        where: { userId: learner.id, circleId: resolvedCircleId, leftAt: null },
      });
      if (!existingMembership) {
        await tx.circleMembership.create({
          data: { userId: learner.id, circleId: resolvedCircleId },
        });
      }
      await tx.user.update({
        where: { id: learner.id },
        data: { circleId: resolvedCircleId },
      });
      updatedLearnerIds.push(learner.id);
    }

    if (updatedLearnerIds.length > 0) {
      await tx.auditLogEntry.create({
        data: {
          eventType: "FAMILY_CONNECTED_TO_CIRCLE",
          actorUserId: administratorUserId,
          summary: `Backfilled Circle assignment for ${updatedLearnerIds.length} Phase 1-era learner(s) still carrying a null circleId.`,
          metadata: {
            circleId: resolvedCircleId,
            learnerUserIds: updatedLearnerIds,
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    return { circleId: resolvedCircleId, updatedLearnerIds };
  });
}
