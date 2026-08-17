import type { GeniusCycleMovement, Prisma, RecoveryCycleStep } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

/**
 * Blueprint 04 Part Six's own eight labeled steps, 0 through 7, in order.
 * See the `GeniusCycleMovement` enum's own doc comment in schema.prisma for
 * why the full 0-7 sequence is modeled rather than resolving Part Six's
 * "seven movements" / eight-steps naming ambiguity here.
 */
const MOVEMENT_ORDER: GeniusCycleMovement[] = [
  "GENIE_CHECK_IN",
  "AWAKEN",
  "THINK",
  "CREATE",
  "LEAD_AND_SERVE",
  "BUILD",
  "REFLECT",
  "GENIE_CHECK_OUT",
];

/** Blueprint 04 Part Fourteen's six named Recovery Cycle steps, in order. */
const RECOVERY_STEP_ORDER: RecoveryCycleStep[] = ["TRY", "FAIL", "REFLECT", "RECOVER", "REORIENT", "TRY_AGAIN"];

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`GeniusCycleSession ${sessionId} not found for this learner.`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionNotActiveError extends Error {
  constructor(status: string) {
    super(`Session is ${status}, not IN_PROGRESS -- this action is not valid from that state.`);
    this.name = "SessionNotActiveError";
  }
}

export class InvalidMovementTransitionError extends Error {}

/**
 * Architecture Spec Part Seven Workflow 1's own guarantee: "a learner never
 * begins working with an unaccompanied Genie." Checked here in application
 * code and, per Part Six's "two layers, not one," again at the database
 * layer by the `genius_cycle_sessions_insert_own` RLS policy (prisma/
 * migrations/20260818090400_genius_cycle_session_requires_active_mentor).
 */
export class NoActiveMentorError extends Error {
  constructor() {
    super("Learner has no active MentorAssignment; a Genius Cycle session cannot start without one.");
    this.name = "NoActiveMentorError";
  }
}

/**
 * Daily Learning -- Architecture Spec Part Seven, Workflow 2: "runs the
 * seven-movement Genius Cycle from Blueprint 04 as an explicit state
 * machine, not a freeform activity log." My Genie and the Teacher Assistant
 * are named in Workflow 2 as "available inside a session" -- per this
 * slice's deferred-agent boundary, every function below implements only the
 * session's human-only mechanics (start, movement progression, the Recovery
 * Cycle branch, completion, evidence write). Nothing here references
 * `AgentDefinition` or `AgentInteraction`.
 */
export async function startGeniusCycleSession({
  learnerUserId,
  curriculumDomainId,
}: {
  learnerUserId: string;
  curriculumDomainId: string;
}) {
  return runAsUser(learnerUserId, async (tx) => {
    const activeMentorCount = await tx.mentorAssignment.count({
      where: { learnerUserId, validTo: null },
    });
    if (activeMentorCount === 0) {
      throw new NoActiveMentorError();
    }

    return tx.geniusCycleSession.create({
      data: {
        learnerUserId,
        curriculumDomainId,
        status: "IN_PROGRESS",
        currentMovement: "GENIE_CHECK_IN",
      },
    });
  });
}

async function loadActiveSession(
  tx: Prisma.TransactionClient,
  learnerUserId: string,
  sessionId: string,
  expectedStatuses: string[],
) {
  const session = await tx.geniusCycleSession.findFirst({
    where: { id: sessionId, learnerUserId },
  });
  if (!session) throw new SessionNotFoundError(sessionId);
  if (!expectedStatuses.includes(session.status)) throw new SessionNotActiveError(session.status);
  return session;
}

/** Advances to the next of Blueprint 04 Part Six's eight movements, in order. */
export async function advanceMovement({ learnerUserId, sessionId }: { learnerUserId: string; sessionId: string }) {
  return runAsUser(learnerUserId, async (tx) => {
    const session = await loadActiveSession(tx, learnerUserId, sessionId, ["IN_PROGRESS"]);

    const currentIndex = MOVEMENT_ORDER.indexOf(session.currentMovement);
    if (currentIndex === MOVEMENT_ORDER.length - 1) {
      throw new InvalidMovementTransitionError(
        "Already at Genie Check-Out (movement 7); call completeSession instead of advancing further.",
      );
    }

    return tx.geniusCycleSession.update({
      where: { id: sessionId },
      data: { currentMovement: MOVEMENT_ORDER[currentIndex + 1] },
    });
  });
}

/**
 * Completes an ordinary (non-Recovery-Cycle) session. Workflow 2's own text:
 * "only completion of a full cycle ... writes a PortfolioEntry. Partial,
 * abandoned sessions do not silently become evidence" -- so this function
 * refuses to complete a session that has not reached Genie Check-Out, and
 * refuses to complete one with no evidence content supplied at all.
 */
export async function completeSession({
  learnerUserId,
  sessionId,
  reflectionContent,
  artifactContent,
}: {
  learnerUserId: string;
  sessionId: string;
  reflectionContent?: Prisma.InputJsonValue;
  artifactContent?: Prisma.InputJsonValue;
}) {
  return runAsUser(learnerUserId, async (tx) => {
    const session = await loadActiveSession(tx, learnerUserId, sessionId, ["IN_PROGRESS"]);

    if (session.currentMovement !== "GENIE_CHECK_OUT") {
      throw new InvalidMovementTransitionError(
        "A session must reach Genie Check-Out (movement 7) before it can be completed.",
      );
    }
    if (!reflectionContent && !artifactContent) {
      throw new Error("Completing a session requires at least one of reflectionContent or artifactContent.");
    }

    const updated = await tx.geniusCycleSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const portfolioEntries = [];
    if (reflectionContent) {
      portfolioEntries.push(
        await tx.portfolioEntry.create({
          data: {
            learnerUserId,
            entryType: "REFLECTION",
            curriculumDomainId: session.curriculumDomainId,
            geniusCycleSessionId: sessionId,
            title: "Reflect",
            content: reflectionContent,
          },
        }),
      );
    }
    if (artifactContent) {
      portfolioEntries.push(
        await tx.portfolioEntry.create({
          data: {
            learnerUserId,
            entryType: "ARTIFACT",
            curriculumDomainId: session.curriculumDomainId,
            geniusCycleSessionId: sessionId,
            title: "Build",
            content: artifactContent,
          },
        }),
      );
    }

    return { session: updated, portfolioEntries };
  });
}

/**
 * Workflow 2: "Partial, abandoned sessions do not silently become
 * evidence." No `PortfolioEntry` is written here, deliberately.
 */
export async function abandonSession({ learnerUserId, sessionId }: { learnerUserId: string; sessionId: string }) {
  return runAsUser(learnerUserId, async (tx) => {
    await loadActiveSession(tx, learnerUserId, sessionId, ["IN_PROGRESS", "IN_RECOVERY_CYCLE"]);

    return tx.geniusCycleSession.update({
      where: { id: sessionId },
      data: { status: "ABANDONED", abandonedAt: new Date() },
    });
  });
}

/**
 * Branches an in-progress session into the Recovery Cycle -- Blueprint 04
 * Part Fourteen: "run whenever a learner's own account of events, a
 * mentor's observation, or a Genie Check-In flags a failed attempt, an
 * abandoned project, a talent that stopped feeling true, or a plain 'I
 * don't want to do this anymore.'"
 */
export async function branchToRecoveryCycle({
  learnerUserId,
  sessionId,
}: {
  learnerUserId: string;
  sessionId: string;
}) {
  return runAsUser(learnerUserId, async (tx) => {
    await loadActiveSession(tx, learnerUserId, sessionId, ["IN_PROGRESS"]);

    return tx.geniusCycleSession.update({
      where: { id: sessionId },
      data: { status: "IN_RECOVERY_CYCLE", recoveryCycleStep: "TRY" },
    });
  });
}

/**
 * Advances one step through Blueprint 04 Part Fourteen's Try / Fail /
 * Reflect / Recover / Reorient / Try Again sequence. Reaching Try Again is
 * the one Recovery Cycle outcome that writes `PortfolioEntry` evidence, per
 * this slice's own scope note and Part Fourteen's own text: "The Genius
 * Portfolio records the whole arc as evidence of development ... a
 * documented recovery is itself Genius Level evidence ... not a gap in the
 * record." `recoveryContent` is therefore required only on the step that
 * reaches `TRY_AGAIN`.
 */
export async function advanceRecoveryCycleStep({
  learnerUserId,
  sessionId,
  recoveryContent,
}: {
  learnerUserId: string;
  sessionId: string;
  recoveryContent?: Prisma.InputJsonValue;
}) {
  return runAsUser(learnerUserId, async (tx) => {
    const session = await loadActiveSession(tx, learnerUserId, sessionId, ["IN_RECOVERY_CYCLE"]);
    if (!session.recoveryCycleStep) {
      throw new SessionNotActiveError(session.status);
    }

    const currentIndex = RECOVERY_STEP_ORDER.indexOf(session.recoveryCycleStep);
    if (currentIndex === RECOVERY_STEP_ORDER.length - 1) {
      throw new InvalidMovementTransitionError("Already at Try Again; the Recovery Cycle branch is complete.");
    }

    const nextStep = RECOVERY_STEP_ORDER[currentIndex + 1];

    if (nextStep !== "TRY_AGAIN") {
      return tx.geniusCycleSession.update({
        where: { id: sessionId },
        data: { recoveryCycleStep: nextStep },
      });
    }

    if (!recoveryContent) {
      throw new Error("Reaching Try Again requires recoveryContent, recorded as RECOVERY_CYCLE_RECORD evidence.");
    }

    const updated = await tx.geniusCycleSession.update({
      where: { id: sessionId },
      data: { status: "RECOVERY_COMPLETED", recoveryCycleStep: "TRY_AGAIN", completedAt: new Date() },
    });

    const portfolioEntry = await tx.portfolioEntry.create({
      data: {
        learnerUserId,
        entryType: "RECOVERY_CYCLE_RECORD",
        curriculumDomainId: session.curriculumDomainId,
        geniusCycleSessionId: sessionId,
        title: "Recovery Cycle: Try Again",
        content: recoveryContent,
      },
    });

    return { session: updated, portfolioEntry };
  });
}
