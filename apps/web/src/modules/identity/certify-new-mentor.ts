import type { FaithBackground, Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

import { MENTOR_CASELOAD_CEILING } from "./mentor-assignment";

export class QualificationsNotConfirmedError extends Error {
  constructor() {
    super("New Mentor Certification requires the certifying office's qualifications confirmation.");
    this.name = "QualificationsNotConfirmedError";
  }
}

export class TeacherCreedNotAffirmedError extends Error {
  constructor() {
    super("New Mentor Certification requires Teacher Creed affirmation.");
    this.name = "TeacherCreedNotAffirmedError";
  }
}

export class AlreadyAMentorError extends Error {
  constructor(userId: string) {
    super(`User ${userId} already holds an active MENTOR Role.`);
    this.name = "AlreadyAMentorError";
  }
}

/**
 * New Mentor Certification -- Architecture Spec Part Seven, Workflow 6,
 * already fully specified there, not re-derived here: "An Administrator
 * initiates the workflow; the certifying office named in Blueprint 11
 * confirms qualifications and Teacher Creed affirmation; a Role record is
 * created with an explicit caseload ceiling, and the messaging and learning
 * modules only expose a given learner to a Mentor once that Role record is
 * active, never before."
 *
 * This is the real certification path Phase 1 Slice A's manually-seeded
 * Mentor bootstrap (src/modules/identity/mentor-bootstrap.ts) explicitly
 * said was coming: "the full New Mentor Certification workflow arriving on
 * schedule in Phase 2 to handle every Mentor after that bootstrap set"
 * (Roadmap Part 5). Every Mentor certified from this point forward goes
 * through this function, not the bootstrap script -- the bootstrap script
 * itself is untouched and remains what it always was, a one-time,
 * documented exception.
 *
 * "The certifying office named in Blueprint 11" is the Chief Educational
 * Architect (Blueprint 11 Section Four: "certification by the Chief
 * Educational Architect"), a Constitutional Office (Blueprint 08 Part One
 * Section Three), not one of the fifteen operational roles this schema's
 * `RoleType` enum models (Phase 0's own closed enumeration). No schema or
 * RLS scaffolding for Constitutional Offices exists in this build yet, and
 * building it is not part of this phase's own scope. Rather than block this
 * workflow on modeling an office this codebase has no other representation
 * of, `qualificationsConfirmed` and `teacherCreedAffirmed` are explicit,
 * required boolean parameters an Administrator attests to on the certifying
 * office's behalf -- the same "human-only mechanics, Administrator-run"
 * pattern this phase's own consistency decision applies to Administrator AI
 * and Parent Companion. This is a deliberate, named scope boundary, not a
 * silent substitution of Administrator authority for the Chief Educational
 * Architect's own -- flagged here and in the PR description rather than
 * smoothed over.
 *
 * The caseload ceiling is not a new field on `Role` -- "a Role record is
 * created with an explicit caseload ceiling" is satisfied by
 * `MENTOR_CASELOAD_CEILING` (src/modules/identity/mentor-assignment.ts),
 * the single constant every `MentorAssignment` insert is already checked
 * against, reused here rather than redefined, per this phase's own
 * instruction.
 *
 * "messaging and learning only expose a learner to a Mentor once that Role
 * record is active" requires no new code here: `app_actor_is_mentor_of()`
 * (the RLS helper every Mentor-facing policy in `learning`, `assessment`,
 * and `messaging` already calls) checks `roles.valid_to IS NULL` -- a
 * newly-certified Mentor becomes eligible for `assignMentor` /
 * `findMentorWithCapacityTx` the instant this function's transaction
 * commits, an emergent property of the existing RLS design, not something
 * this function has to separately enforce.
 */
export async function certifyNewMentor({
  administratorUserId,
  mentorUserId,
  qualificationsConfirmed,
  teacherCreedAffirmed,
  faithBackground,
  notes,
}: {
  administratorUserId: string;
  mentorUserId: string;
  qualificationsConfirmed: boolean;
  teacherCreedAffirmed: boolean;
  /**
   * Optional -- added for the Mentor rotation task, Blueprint 11 Section
   * Four: a Mentor's own faith background, recorded so a same-faith match
   * (`findMentorWithCapacityTx`, mentor-assignment.ts) has something real to
   * compare a family's `User.faithBackgroundPreference` against. Never a
   * certification requirement: this Section's own qualification bar is
   * explicit that a Mentor "is not thereby less qualified" for not sharing,
   * or not stating, any particular faith background, so this field is
   * optional here the same way the preference itself is optional at
   * onboarding.
   */
  faithBackground?: FaithBackground | null;
  notes?: string;
}) {
  if (!qualificationsConfirmed) {
    throw new QualificationsNotConfirmedError();
  }
  if (!teacherCreedAffirmed) {
    throw new TeacherCreedNotAffirmedError();
  }

  return runAsUser(administratorUserId, async (tx) => {
    const existingMentorRole = await tx.role.findFirst({
      where: { userId: mentorUserId, roleType: "MENTOR", validTo: null },
    });
    if (existingMentorRole) {
      throw new AlreadyAMentorError(mentorUserId);
    }

    const mentorRole = await tx.role.create({
      data: {
        userId: mentorUserId,
        roleType: "MENTOR",
        grantedByUserId: administratorUserId,
        mentorFaithBackground: faithBackground,
        notes: [
          "New Mentor Certification (Architecture Spec Part Seven, Workflow 6).",
          "Qualifications confirmed and Teacher Creed affirmed, attested by the initiating Administrator",
          "on the certifying office's behalf (Blueprint 11 Section Four -- see certify-new-mentor.ts's own",
          `doc comment for why). Caseload ceiling: ${MENTOR_CASELOAD_CEILING} learners, combined across tracks.`,
          notes ? `Notes: ${notes}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      },
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "MENTOR_CERTIFIED",
        actorUserId: administratorUserId,
        targetUserId: mentorUserId,
        summary: "New Mentor certified (Architecture Spec Part Seven, Workflow 6).",
        metadata: {
          roleId: mentorRole.id,
          qualificationsConfirmed,
          teacherCreedAffirmed,
          caseloadCeiling: MENTOR_CASELOAD_CEILING,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return mentorRole;
  });
}
