import type { Prisma, Track } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

import { assignMentorTx, findMentorWithCapacityTx } from "./mentor-assignment";

export class NoMentorCapacityError extends Error {
  constructor() {
    super("No active Mentor has caseload capacity under the twenty-learner ceiling.");
    this.name = "NoMentorCapacityError";
  }
}

export class MinorRequiresParentLinkError extends Error {
  constructor() {
    super("A minor learner requires a parentUserId to create the ParentLink Blueprint 12 requires.");
    this.name = "MinorRequiresParentLinkError";
  }
}

function isMinor(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age < 18;
}

/**
 * New Learner Onboarding -- Architecture Spec Part Seven, Workflow 1:
 * "produces: an active Genius Portfolio and a first Mentor relationship."
 * "A Parent or, for an adult learner, the learner themselves creates an
 * Identity account. Age is captured at this step and drives every
 * downstream age-gating decision ... Track selection (Home or Membership)
 * sets the cadence defaults ... An Administrator ... assigns a first Mentor
 * from available caseload capacity ... My Genie is instantiated for the
 * learner, its GenieMemory table created empty ... a learner never begins
 * working with an unaccompanied Genie."
 *
 * Run as a single Administrator-driven transaction rather than split across
 * a separate self-service sign-up step and a later Administrator step: no
 * self-service sign-up UI exists yet in this slice (Auth.js has no
 * providers configured -- see auth.ts's own doc comment), so an
 * Administrator performing the whole workflow on a family's behalf is this
 * slice's faithful "human-only mechanics" implementation of Workflow 1, not
 * a shortcut around it. A future self-service sign-up flow can create the
 * `User`/`Role`/`ParentLink` rows under the parent's own session instead and
 * still call `assignMentor` (mentor-assignment.ts) separately for the
 * Administrator-only step, without any change to this function's data
 * model.
 *
 * Atomic: the learner's `User`, `LEARNER` `Role`, `ParentLink` (if a minor),
 * empty `GenieMemory`, and `MentorAssignment` are all created in one
 * transaction, so it is never possible to observe a learner who exists
 * without an active Mentor -- the literal guarantee Workflow 1's own text
 * states.
 *
 * Circle assignment is deliberately omitted -- Roadmap Part 5's first
 * "sequencing wrinkle": `community` (the module that would provide a real
 * Circle) doesn't ship until Phase 2. `User.circleId` stays null until then.
 */
export async function onboardLearner({
  administratorUserId,
  learner,
  parentUserId,
  mentorRoleId,
}: {
  administratorUserId: string;
  learner: {
    email?: string;
    name: string;
    dateOfBirth: Date;
    track: Track;
  };
  /** Required when the learner is a minor; the parent's existing User id. */
  parentUserId?: string;
  /**
   * Explicit Mentor choice. Omitted means "assign the first Mentor with
   * capacity" (Workflow 1's own phrasing), resolved via
   * `findMentorWithCapacityTx`.
   */
  mentorRoleId?: string;
}) {
  if (isMinor(learner.dateOfBirth) && !parentUserId) {
    throw new MinorRequiresParentLinkError();
  }

  return runAsUser(administratorUserId, async (tx) => {
    const learnerUser = await tx.user.create({
      data: {
        email: learner.email,
        name: learner.name,
        dateOfBirth: learner.dateOfBirth,
        track: learner.track,
      },
    });

    await tx.role.create({
      data: {
        userId: learnerUser.id,
        roleType: "LEARNER",
        grantedByUserId: administratorUserId,
      },
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "ROLE_GRANTED",
        actorUserId: administratorUserId,
        targetUserId: learnerUser.id,
        summary: "LEARNER role granted during New Learner Onboarding (Architecture Spec Part Seven, Workflow 1).",
      },
    });

    if (parentUserId) {
      await tx.parentLink.create({
        data: { parentUserId, minorUserId: learnerUser.id },
      });

      await tx.auditLogEntry.create({
        data: {
          eventType: "PARENT_LINK_CREATED",
          actorUserId: administratorUserId,
          targetUserId: learnerUser.id,
          summary: "ParentLink created during New Learner Onboarding, per Blueprint 12.",
          metadata: { parentUserId } satisfies Prisma.InputJsonValue,
        },
      });
    }

    // "My Genie is instantiated for the learner, its GenieMemory table
    // created empty" -- the row, not a live conversation (see GenieMemory's
    // own doc comment in schema.prisma).
    await tx.genieMemory.create({ data: { learnerUserId: learnerUser.id } });

    const resolvedMentorRoleId =
      mentorRoleId ?? (await findMentorWithCapacityTx(tx))?.mentorRoleId ?? null;
    if (!resolvedMentorRoleId) {
      throw new NoMentorCapacityError();
    }

    const mentorAssignment = await assignMentorTx(tx, {
      administratorUserId,
      learnerUserId: learnerUser.id,
      mentorRoleId: resolvedMentorRoleId,
    });

    return { learner: learnerUser, mentorAssignment };
  });
}
