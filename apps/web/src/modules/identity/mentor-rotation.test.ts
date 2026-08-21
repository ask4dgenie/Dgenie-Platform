import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeMentorRotation,
  OutgoingAssignmentNotActiveError,
  resolveMentorRotationDue,
  type MentorRotationRepository,
} from "./mentor-rotation";

const TERM_STARTED_AT = new Date("2020-01-01T00:00:00.000Z");
const JUST_BEFORE_FIVE_YEARS = new Date("2024-12-31T00:00:00.000Z");
const EXACTLY_FIVE_YEARS = new Date("2025-01-01T00:00:00.000Z");
const WELL_PAST_FIVE_YEARS = new Date("2026-06-01T00:00:00.000Z");

test("resolveMentorRotationDue: not due before the five-year mark", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: false,
    now: JUST_BEFORE_FIVE_YEARS,
  });
  assert.equal(result.status, "NOT_DUE");
});

test("resolveMentorRotationDue: due exactly at the five-year mark, with a renewal available for a first term", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: false,
    now: EXACTLY_FIVE_YEARS,
  });
  assert.equal(result.status, "DUE");
  assert.equal(result.renewalAvailable, true);
});

test("resolveMentorRotationDue: due, but mandatory (no renewal available) once one renewal has already occurred -- the hard ten-year ceiling", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: true,
    hasActiveDisruptionTransition: false,
    now: WELL_PAST_FIVE_YEARS,
  });
  assert.equal(result.status, "DUE");
  assert.equal(result.renewalAvailable, false);
});

test("resolveMentorRotationDue: due-but-paused during an active Disruption transition, distinct from both NOT_DUE and DUE", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: true,
    now: WELL_PAST_FIVE_YEARS,
  });
  assert.equal(result.status, "DUE_BUT_PAUSED");
});

test("resolveMentorRotationDue: the rotation clock resumes from where it paused rather than restarting", () => {
  const paused = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: true,
    now: WELL_PAST_FIVE_YEARS,
  });

  // The disruption resolves; the same termStartedAt, now unpaused, is due
  // immediately -- not a fresh five-year countdown from `now`.
  const resumed = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: false,
    now: WELL_PAST_FIVE_YEARS,
  });

  assert.equal(paused.dueAt.getTime(), resumed.dueAt.getTime());
  assert.equal(resumed.status, "DUE");
});

test("resolveMentorRotationDue: the rotation requirement ends at Legacy Induction, overriding an otherwise clearly-overdue term", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: true,
    hasActiveDisruptionTransition: false,
    hasReachedLegacyInduction: true,
    now: WELL_PAST_FIVE_YEARS,
  });
  assert.equal(result.status, "ROTATION_REQUIREMENT_ENDED");
});

test("resolveMentorRotationDue: Legacy Induction overrides even an active Disruption pause", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: true,
    hasReachedLegacyInduction: true,
    now: WELL_PAST_FIVE_YEARS,
  });
  assert.equal(result.status, "ROTATION_REQUIREMENT_ENDED");
});

test("resolveMentorRotationDue: hasReachedLegacyInduction defaults to false", () => {
  const result = resolveMentorRotationDue({
    termStartedAt: TERM_STARTED_AT,
    hasAlreadyRenewed: false,
    hasActiveDisruptionTransition: false,
    now: WELL_PAST_FIVE_YEARS,
  });
  assert.equal(result.status, "DUE");
});

/**
 * An in-memory fake proving the continuity guarantee the same way
 * voice-lock-activation.test.ts's own "database-layer backstop" test
 * proved write-once: by controlling exactly when each repository method is
 * called and observed, not by asserting on a comment.
 */
function createFakeRepository(options: { failIncomingCreation?: boolean } = {}) {
  const calls: string[] = [];
  let outgoingClosed = false;
  const outgoing = { id: "assignment-outgoing", learnerUserId: "learner-1", mentorRoleId: "mentor-role-old" };

  const repository: MentorRotationRepository = {
    async getActiveOutgoingAssignment(outgoingAssignmentId) {
      calls.push("getActiveOutgoingAssignment");
      if (outgoingAssignmentId !== outgoing.id || outgoingClosed) {
        return null;
      }
      return outgoing;
    },
    async createIncomingAssignment({ mentorRoleId }) {
      calls.push("createIncomingAssignment");
      if (options.failIncomingCreation) {
        throw new Error("No incoming Mentor confirmed yet.");
      }
      return { id: "assignment-incoming", mentorRoleId };
    },
    async closeOutgoingAssignment() {
      calls.push("closeOutgoingAssignment");
      outgoingClosed = true;
    },
  };

  return { repository, calls, isOutgoingClosed: () => outgoingClosed };
}

test("executeMentorRotation: a successful rotation creates the incoming assignment before closing the outgoing one", async () => {
  const { repository, calls, isOutgoingClosed } = createFakeRepository();

  const result = await executeMentorRotation({
    repository,
    outgoingAssignmentId: "assignment-outgoing",
    incomingMentorRoleId: "mentor-role-new",
  });

  assert.deepEqual(calls, ["getActiveOutgoingAssignment", "createIncomingAssignment", "closeOutgoingAssignment"]);
  assert.equal(isOutgoingClosed(), true);
  assert.equal(result.isRenewal, false);
  assert.equal(result.incomingAssignmentId, "assignment-incoming");
});

test("executeMentorRotation: the same Mentor Role as incoming is recognized as a renewal", async () => {
  const { repository } = createFakeRepository();

  const result = await executeMentorRotation({
    repository,
    outgoingAssignmentId: "assignment-outgoing",
    incomingMentorRoleId: "mentor-role-old",
  });

  assert.equal(result.isRenewal, true);
});

test("executeMentorRotation: the continuity guarantee -- when no incoming Mentor can be confirmed, the outgoing assignment's validity window is never touched", async () => {
  const { repository, calls, isOutgoingClosed } = createFakeRepository({ failIncomingCreation: true });

  await assert.rejects(
    () =>
      executeMentorRotation({
        repository,
        outgoingAssignmentId: "assignment-outgoing",
        incomingMentorRoleId: "mentor-role-new",
      }),
    /No incoming Mentor confirmed yet\./,
  );

  // closeOutgoingAssignment was never called at all -- not called-then-
  // rolled-back, never called, the literal "untouched until the incoming
  // one is created" guarantee this task asks for.
  assert.deepEqual(calls, ["getActiveOutgoingAssignment", "createIncomingAssignment"]);
  assert.equal(isOutgoingClosed(), false);
});

test("executeMentorRotation: refuses when the outgoing assignment is not currently active", async () => {
  const { repository } = createFakeRepository();

  await assert.rejects(
    () =>
      executeMentorRotation({
        repository,
        outgoingAssignmentId: "assignment-does-not-exist",
        incomingMentorRoleId: "mentor-role-new",
      }),
    OutgoingAssignmentNotActiveError,
  );
});
