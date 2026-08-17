import type { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

export class NoEvidenceCitedError extends Error {
  constructor() {
    super(
      "Architecture Spec Part Seven Workflow 4: certification 'requires a citation of specific evidence, not a bare approval.'",
    );
    this.name = "NoEvidenceCitedError";
  }
}

export class NotAMentorError extends Error {
  constructor() {
    super("Only a User holding an active MENTOR Role may certify a Genius Level (Architecture Spec Part Seven Workflow 4).");
    this.name = "NotAMentorError";
  }
}

export class NotAssignedMentorError extends Error {
  constructor() {
    super("This Mentor is not the learner's currently-assigned Mentor.");
    this.name = "NotAssignedMentorError";
  }
}

export class EvidenceNotOwnedByLearnerError extends Error {
  constructor() {
    super("One or more cited PortfolioEntry ids do not belong to the learner being certified.");
    this.name = "EvidenceNotOwnedByLearnerError";
  }
}

/**
 * Genius Level Certification -- Architecture Spec Part Seven, Workflow 4:
 * "The Assessment Assistant scans PortfolioEntry evidence ... and surfaces a
 * candidate advancement to the certifying Mentor -- this is the single
 * clearest instance of the Agent Gateway's boundary in daily operation. The
 * agent's tool allowlist has no path to write a CertificationRecord; only a
 * human User holding the correct Role can call that action, and the action
 * requires a citation of specific evidence, not a bare approval."
 *
 * Per this slice's deferred-agent boundary, the Assessment Assistant's
 * automated evidence-scanning half is out of scope (it is not on Phase 1's
 * own "Agents live" list either, per the Roadmap). This function is the
 * other half -- the constitutionally load-bearing one -- unchanged by that
 * deferral: a human Mentor reviews evidence and writes the
 * `CertificationRecord` themselves, the only path the schema allows.
 *
 * Four checks run before anything is written, application-layer, on top of
 * the database-layer enforcement already described on the
 * `CertificationRecord` model itself (schema.prisma) and the
 * `certification_records_insert_mentor` RLS policy: the acting user holds
 * an active MENTOR Role; they are specifically *this* learner's
 * currently-assigned Mentor (not any Mentor); at least one evidence
 * citation is supplied; and every cited `PortfolioEntry` actually belongs
 * to the learner being certified (the database's foreign key alone only
 * guarantees the cited row exists, not that it is this learner's own
 * evidence).
 */
export async function certifyGeniusLevel({
  mentorUserId,
  learnerUserId,
  geniusLevelRubricId,
  evidencePortfolioEntryIds,
  notes,
}: {
  mentorUserId: string;
  learnerUserId: string;
  geniusLevelRubricId: string;
  evidencePortfolioEntryIds: string[];
  notes?: string;
}) {
  if (evidencePortfolioEntryIds.length === 0) {
    throw new NoEvidenceCitedError();
  }

  return runAsUser(mentorUserId, async (tx) => {
    const mentorRole = await tx.role.findFirst({
      where: { userId: mentorUserId, roleType: "MENTOR", validTo: null },
    });
    if (!mentorRole) {
      throw new NotAMentorError();
    }

    const isAssignedMentor = await tx.mentorAssignment.findFirst({
      where: { mentorRoleId: mentorRole.id, learnerUserId, validTo: null },
    });
    if (!isAssignedMentor) {
      throw new NotAssignedMentorError();
    }

    const rubric = await tx.geniusLevelRubric.findUniqueOrThrow({
      where: { id: geniusLevelRubricId },
    });

    const ownedEvidence = await tx.portfolioEntry.findMany({
      where: { id: { in: evidencePortfolioEntryIds }, learnerUserId },
      select: { id: true },
    });
    if (ownedEvidence.length !== evidencePortfolioEntryIds.length) {
      throw new EvidenceNotOwnedByLearnerError();
    }

    const certificationRecord = await tx.certificationRecord.create({
      data: {
        learnerUserId,
        geniusLevelRubricId,
        certifiedByUserId: mentorUserId,
        certifiedByRoleId: mentorRole.id,
        notes,
      },
    });

    await tx.certificationRecordEvidence.createMany({
      data: evidencePortfolioEntryIds.map((portfolioEntryId) => ({
        certificationRecordId: certificationRecord.id,
        portfolioEntryId,
      })),
    });

    // "one certified milestone" is itself a PortfolioEntry kind (Architecture
    // Spec Part Four) -- written on the learner's behalf by their assigned
    // Mentor, per the `portfolio_entries_insert` RLS policy's explicit
    // Mentor-acting-on-a-learner's-behalf case.
    const milestoneEntry = await tx.portfolioEntry.create({
      data: {
        learnerUserId,
        entryType: "CERTIFIED_MILESTONE",
        curriculumDomainId: rubric.curriculumDomainId,
        title: `Genius Level ${rubric.level} certified: ${rubric.levelName}`,
        content: {
          geniusLevelRubricId,
          certificationRecordId: certificationRecord.id,
          level: rubric.level,
          levelName: rubric.levelName,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "CERTIFICATION_DECISION",
        actorUserId: mentorUserId,
        targetUserId: learnerUserId,
        summary: `Genius Level ${rubric.level} (${rubric.levelName}) certified for learner, citing ${evidencePortfolioEntryIds.length} evidence ${evidencePortfolioEntryIds.length === 1 ? "entry" : "entries"}.`,
        metadata: {
          certificationRecordId: certificationRecord.id,
          geniusLevelRubricId,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { certificationRecord, milestoneEntry };
  });
}
