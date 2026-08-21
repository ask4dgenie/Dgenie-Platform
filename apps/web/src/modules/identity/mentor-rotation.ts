import type { FaithBackground, Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

import { assignMentorTx, findMentorWithCapacityTx } from "./mentor-assignment";

/**
 * The Mentor five-year rotation -- Blueprint 11 Section Four's "Mentor term
 * and rotation" paragraph (standard five-year term, one mutual-request
 * renewal, a hard ten-year ceiling, ending at Legacy Induction) and
 * Blueprint 07 Part Five's "Planned Mentor rotation and handoff" standard
 * (the continuity guarantee and Disruption-pause rule this Section's own
 * text forward-references without specifying).
 *
 * __A named, honest stand-in, not a claim of real Transition tracking.__
 * Blueprint 04's general Transition framework (six transition types,
 * Disruption-transition tracking) has no table or module anywhere in this
 * codebase, and building it is real, separate, unscoped work -- not this
 * task's to do. `resolveMentorRotationDue` below therefore accepts
 * `hasActiveDisruptionTransition` as a caller-supplied argument rather than
 * querying a Disruption table that doesn't exist; whoever calls this
 * function is responsible for knowing that today, since nothing in this
 * codebase can answer it. The same honest-stand-in treatment applies to
 * `hasReachedLegacyInduction`: Legacy Induction (`legacy-module`) is Phase
 * 4, not-started, so this defaults to `false` and is never computed here.
 */

export const MENTOR_ASSIGNMENT_STANDARD_TERM_YEARS = 5;

export type MentorRotationStatus = "NOT_DUE" | "DUE" | "DUE_BUT_PAUSED" | "ROTATION_REQUIREMENT_ENDED";

export interface MentorRotationDueResult {
  readonly status: MentorRotationStatus;
  /**
   * Meaningful when `status` is `"DUE"` or `"DUE_BUT_PAUSED"`: whether a
   * mutual-request renewal is still an option (this is the assignment's
   * first term reaching its five-year mark), or whether the hard two-term
   * ceiling has already been used and rotation is mandatory (this is
   * already the renewed, second term reaching its own five-year mark).
   * Blueprint 11 Section Four: "a hard ceiling of two consecutive terms,
   * ten years, with the same Mentor before rotation becomes mandatory
   * regardless of request."
   */
  readonly renewalAvailable: boolean;
  /**
   * The fixed point in time this term's five-year clock reaches its
   * threshold -- `termStartedAt` plus five years, never recomputed from
   * `now`. This is what makes the Disruption-pause rule's "resumes from
   * where it paused rather than restarting" (Blueprint 07 Part Five) true
   * by construction: pausing never moves this date, so once
   * `hasActiveDisruptionTransition` clears, the very next call with the
   * same `termStartedAt` reports `"DUE"` again immediately, not a fresh
   * five-year countdown.
   */
  readonly dueAt: Date;
}

/**
 * Pure. No database access, no clock read beyond the `now` parameter
 * (defaulted for real callers, fixed for tests) -- the same "a literal,
 * testable property of the codebase" discipline Architecture Spec Part
 * Five asks of the Agent Gateway's own boundaries, applied here to a
 * governance rule instead.
 *
 * __Known, named gap: Blueprint 11 Section Four's Circle One extended
 * first-term exception is not implemented here.__ That paragraph also
 * states a learner whose first Mentor assignment begins during Circle One
 * (Blueprint 02's Discovery pathway, roughly ages two through nine) gets an
 * extended first term running through the end of Circle One rather than a
 * fixed five-year cutoff. This task's own "what ships" scope enumerates
 * only the standard five-year term, the one-renewal/ten-year-ceiling rule,
 * the Legacy Induction end point, and the Disruption-pause rule -- Circle
 * One is not named among them, and no Circle/Discovery-pathway-stage data
 * exists anywhere in this schema to compute it against even if it were.
 * `termStartedAt` is therefore always treated as the start of a standard
 * five-year term, including for a learner's very first assignment. Flagged
 * here and in the PR description rather than silently built or silently
 * dropped, the same discipline this project applies to every other named
 * gap.
 */
export function resolveMentorRotationDue({
  termStartedAt,
  hasAlreadyRenewed,
  hasActiveDisruptionTransition,
  hasReachedLegacyInduction = false,
  now = new Date(),
}: {
  termStartedAt: Date;
  hasAlreadyRenewed: boolean;
  hasActiveDisruptionTransition: boolean;
  /** Defaults false -- see this module's own top comment. */
  hasReachedLegacyInduction?: boolean;
  now?: Date;
}): MentorRotationDueResult {
  const dueAt = new Date(termStartedAt);
  dueAt.setFullYear(dueAt.getFullYear() + MENTOR_ASSIGNMENT_STANDARD_TERM_YEARS);

  const renewalAvailable = !hasAlreadyRenewed;

  // Checked first, and short-circuits everything below regardless of how
  // overdue a rotation might otherwise be -- Blueprint 11 Section Four:
  // "this rotation requirement no longer applies" once Legacy Induction is
  // reached, a blanket end to the requirement itself, not a pause.
  if (hasReachedLegacyInduction) {
    return { status: "ROTATION_REQUIREMENT_ENDED", renewalAvailable, dueAt };
  }

  const isDue = now.getTime() >= dueAt.getTime();
  if (!isDue) {
    return { status: "NOT_DUE", renewalAvailable, dueAt };
  }

  if (hasActiveDisruptionTransition) {
    return { status: "DUE_BUT_PAUSED", renewalAvailable, dueAt };
  }

  return { status: "DUE", renewalAvailable, dueAt };
}

// ---------------------------------------------------------------------------
// The continuity guarantee, enforced.
//
// Blueprint 07 Part Two: "This right is not interrupted by a planned
// rotation." Part Five: "Continuity first: the outgoing Mentor remains the
// learner's named trusted adult until the incoming Mentor is formally
// confirmed and introduced, so a learner is never left without a named
// adult, even briefly, during a transition that exists precisely to protect
// them."
//
// Written against an injected `MentorRotationRepository` rather than a real
// Prisma transaction directly, the same seam-and-stub architecture
// voice-lock-activation.ts (PR#5) established for exactly this reason: this
// build environment has no network path to the live Supabase database, so
// the only way to write a real test proving the guarantee -- not merely
// asserting it in a comment -- is to make the orchestration logic testable
// without one. `createPrismaMentorRotationRepository` and
// `executeMentorRotationForAdministrator` at the bottom of this file are
// the thin production adapter, deliberately untested here.
// ---------------------------------------------------------------------------

export class OutgoingAssignmentNotActiveError extends Error {
  constructor(outgoingAssignmentId: string) {
    super(`MentorAssignment ${outgoingAssignmentId} is not currently active (validTo is not null, or it does not exist).`);
    this.name = "OutgoingAssignmentNotActiveError";
  }
}

export interface MentorRotationRepository {
  getActiveOutgoingAssignment(
    outgoingAssignmentId: string,
  ): Promise<{ id: string; learnerUserId: string; mentorRoleId: string } | null>;
  createIncomingAssignment(params: {
    learnerUserId: string;
    mentorRoleId: string;
  }): Promise<{ id: string; mentorRoleId: string }>;
  closeOutgoingAssignment(assignmentId: string, closedAt: Date): Promise<void>;
}

export interface MentorRotationResult {
  readonly outgoingAssignmentId: string;
  readonly incomingAssignmentId: string;
  /** Whether `incomingMentorRoleId` was the same as the outgoing Mentor's own Role -- a renewal, not a rotation to a new Mentor. */
  readonly isRenewal: boolean;
}

/**
 * The literal enforcement: `createIncomingAssignment` is called, and must
 * succeed, before `closeOutgoingAssignment` ever runs. If creating the
 * incoming assignment throws for any reason (no incoming Mentor confirmed,
 * the target Role invalid, caseload full), `closeOutgoingAssignment` is
 * never called at all -- the outgoing assignment's own validity window is
 * left completely untouched, not merely restored by a transaction
 * rollback. See mentor-rotation.test.ts's own test for the property this
 * ordering exists to prove.
 */
export async function executeMentorRotation({
  repository,
  outgoingAssignmentId,
  incomingMentorRoleId,
  now = new Date(),
}: {
  repository: MentorRotationRepository;
  outgoingAssignmentId: string;
  incomingMentorRoleId: string;
  now?: Date;
}): Promise<MentorRotationResult> {
  const outgoing = await repository.getActiveOutgoingAssignment(outgoingAssignmentId);
  if (!outgoing) {
    throw new OutgoingAssignmentNotActiveError(outgoingAssignmentId);
  }

  const isRenewal = incomingMentorRoleId === outgoing.mentorRoleId;

  const incoming = await repository.createIncomingAssignment({
    learnerUserId: outgoing.learnerUserId,
    mentorRoleId: incomingMentorRoleId,
  });

  await repository.closeOutgoingAssignment(outgoing.id, now);

  return { outgoingAssignmentId: outgoing.id, incomingAssignmentId: incoming.id, isRenewal };
}

/** The production adapter -- thin, deliberately untested here (see this file's own top comment). */
function createPrismaMentorRotationRepository(
  tx: Prisma.TransactionClient,
  administratorUserId: string,
): MentorRotationRepository {
  return {
    async getActiveOutgoingAssignment(outgoingAssignmentId) {
      return tx.mentorAssignment.findFirst({
        where: { id: outgoingAssignmentId, validTo: null },
        select: { id: true, learnerUserId: true, mentorRoleId: true },
      });
    },
    async createIncomingAssignment({ learnerUserId, mentorRoleId }) {
      // Reuses assignMentorTx rather than a bare tx.mentorAssignment.create
      // -- the caseload ceiling and MENTOR-role checks it already performs
      // apply exactly the same way to an incoming rotation Mentor as to a
      // first-time onboarding one, and its own caseload count already
      // excludes this learner's own currently-active row (see its doc
      // comment in mentor-assignment.ts), which is exactly what makes a
      // same-Mentor renewal count correctly here.
      const assignment = await assignMentorTx(tx, { administratorUserId, learnerUserId, mentorRoleId });
      return { id: assignment.id, mentorRoleId: assignment.mentorRoleId };
    },
    async closeOutgoingAssignment(assignmentId, closedAt) {
      await tx.mentorAssignment.update({
        where: { id: assignmentId },
        data: { validTo: closedAt },
      });
    },
  };
}

/**
 * The real entrypoint. Runs as the initiating Administrator's own
 * RLS-scoped session (`runAsUser`), the same "human-only mechanics,
 * Administrator-run" pattern every prior workflow in this module already
 * uses (`onboardLearner`, `assignMentor`, `certifyNewMentor`).
 *
 * `incomingMentorRoleId`, when omitted, is resolved via
 * `findMentorWithCapacityTx`, honoring the learner's own stored
 * `faithBackgroundPreference` (Blueprint 11 Section Four; Blueprint 12
 * Section Five) and excluding the learner's own currently-active row from
 * each candidate's caseload count (mentor-assignment.ts's own doc comment)
 * -- the identical auto-selection New Learner Onboarding already performs
 * for a first assignment, extended here to a later rotation. Omitting it is
 * only meaningful for a genuine rotation to a new Mentor; a renewal always
 * supplies the outgoing Mentor's own Role id explicitly, since "assign
 * whichever Mentor has capacity" would defeat the point of a renewal.
 *
 * `renewalReviewedByUserId` records that Blueprint 11 Section Four's one
 * mutual-request renewal was "reviewed and approved by the Chief
 * Educational Architect" -- an attested id, the same "Administrator
 * attests on the certifying office's behalf" scope boundary
 * certify-new-mentor.ts already documents and this task's own instruction
 * repeats explicitly: this records that a renewal occurred and by whom, it
 * does not build the Chief Educational Architect's own review interface.
 * Ignored (and should be omitted) when `isRenewal` turns out false.
 */
export async function executeMentorRotationForAdministrator({
  administratorUserId,
  outgoingAssignmentId,
  incomingMentorRoleId,
  learnerFaithBackgroundPreference,
  renewalReviewedByUserId,
}: {
  administratorUserId: string;
  outgoingAssignmentId: string;
  /** Omit to auto-resolve via `findMentorWithCapacityTx` -- see this function's own doc comment. */
  incomingMentorRoleId?: string;
  /** Only read when `incomingMentorRoleId` is omitted -- the learner's own `User.faithBackgroundPreference`. */
  learnerFaithBackgroundPreference?: FaithBackground | null;
  renewalReviewedByUserId?: string;
}): Promise<MentorRotationResult> {
  return runAsUser(administratorUserId, async (tx) => {
    const outgoing = await tx.mentorAssignment.findFirst({
      where: { id: outgoingAssignmentId, validTo: null },
      select: { learnerUserId: true },
    });
    if (!outgoing) {
      throw new OutgoingAssignmentNotActiveError(outgoingAssignmentId);
    }

    const resolvedIncomingMentorRoleId =
      incomingMentorRoleId ??
      (
        await findMentorWithCapacityTx(tx, {
          excludeCaseloadForLearnerUserId: outgoing.learnerUserId,
          faithBackgroundPreference: learnerFaithBackgroundPreference,
        })
      )?.mentorRoleId;
    if (!resolvedIncomingMentorRoleId) {
      throw new Error("No active Mentor has caseload capacity to receive this rotation.");
    }

    const result = await executeMentorRotation({
      repository: createPrismaMentorRotationRepository(tx, administratorUserId),
      outgoingAssignmentId,
      incomingMentorRoleId: resolvedIncomingMentorRoleId,
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "MENTOR_ROTATED",
        actorUserId: administratorUserId,
        targetUserId: outgoing.learnerUserId,
        summary: result.isRenewal
          ? "Mentor assignment renewed (Blueprint 11 Section Four's one-renewal allowance)."
          : "Mentor rotated to a new incoming Mentor (Blueprint 11 Section Four's five-year term).",
        metadata: {
          outgoingAssignmentId: result.outgoingAssignmentId,
          incomingAssignmentId: result.incomingAssignmentId,
          incomingMentorRoleId: resolvedIncomingMentorRoleId,
          isRenewal: result.isRenewal,
          renewalReviewedByUserId: result.isRenewal ? (renewalReviewedByUserId ?? null) : null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return result;
  });
}
