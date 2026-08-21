import { runAsUser } from "@/lib/db/rls";
import { isMentorCheckInDueTx, MENTOR_CHECK_IN_INTERVAL_DAYS } from "@/modules/learning/weekly-reflection";

import { countActiveMentorCaseloadTx, MENTOR_CASELOAD_CEILING } from "./mentor-assignment";

/**
 * The partial Mentor Control Tower -- Blueprint 08 Part One, Section
 * Three: "a Regional Steward also monitors the Mentor Control Tower, a
 * real-time view of caseload and strain signals across every Mentor in
 * their region, drawn from the same caseload records, session data, and
 * Blueprint 15 sampled-audit results ... so that a Mentor under strain is
 * offered support and, where needed, a caseload rebalance before that
 * strain produces ... quiet, invisible certification drift."
 *
 * __Two signals are real; two things are honest, named gaps, not finished
 * work.__
 *
 * Real: the caseload signal (`countActiveMentorCaseloadTx`, mentor-
 * assignment.ts -- the identical count `assignMentorTx` and
 * `findMentorWithCapacityTx` already use, not a second implementation) and
 * the session-frequency signal (`isMentorCheckInDueTx`, weekly-
 * reflection.ts -- the identical `MentorSessionTranscript`-based overdue
 * check and `MENTOR_CHECK_IN_INTERVAL_DAYS` cadence Blueprint 04 Part
 * Thirteen already established, rolled up from one learner to a Mentor's
 * whole caseload).
 *
 * Named gap one -- __no Blueprint 15 sampled-audit-results signal.__
 * Blueprint 08 Part One Section Three's own text names three source
 * signals; this module surfaces two. The third, `AuditFinding` data, is
 * `control-tower-full`, Phase 4 -- named in governance as a distinct,
 * later addition, not this task's to pull forward.
 *
 * Named gap two -- __the region-proxy.__ This codebase has no live mapping
 * from a Mentor's caseload to a region, and no `regionId` column on
 * `Role`. A Mentor's own `User.circleId` -> `Circle.regionId` stands in for
 * "which region this Mentor belongs to," applied symmetrically to the
 * requesting Regional Steward's own `circleId` too. This is a proxy, not a
 * guarantee: a Mentor's own community-circle region is not necessarily the
 * region of every learner on their caseload, since Mentor assignment
 * itself (`findMentorWithCapacityTx`) is not region-scoped anywhere in this
 * codebase, and this task's own non-goals explicitly forbid retrofitting
 * it to be. Named in `openBlockers` (`control-centre/manifest.json`)
 * alongside the Transition-framework gap the prior task surfaced.
 *
 * __No strain score, no threshold, no alert.__ Governance names "strain
 * signals" but states no numeric threshold anywhere this task's own
 * reading found. Inventing one (e.g., "counts as strained at 80% of
 * ceiling") would be a real, substantive judgment call with no governance
 * basis -- this module surfaces the raw numbers only and stops there,
 * left to whoever builds the actual Regional Steward-facing view.
 *
 * __The firewall, structural.__ Blueprint 11 Section Eleven: "this same
 * wall applies to the Mentor Control Tower ... the caseload-strain signals
 * it surfaces to a Regional Steward exist to trigger support and
 * rebalancing, never as an input to a Mentor's compensation, evaluation,
 * or advancement." No `compensation` module exists anywhere in this
 * codebase yet, so there is trivially no foreign-key path from this
 * module's output to one today -- and there never will be one accidentally,
 * because this function returns a plain, ephemeral array (`readonly
 * MentorCaseloadSignal[]`), computed fresh on every call, persisted
 * nowhere. A future `compensation` module has nothing here to foreign-key
 * onto even if it tried.
 */

export class NotAuthorizedForControlTowerError extends Error {
  constructor() {
    super("Only an active REGIONAL_STEWARD or ADMINISTRATOR may read the Mentor Control Tower rollup.");
    this.name = "NotAuthorizedForControlTowerError";
  }
}

export class RegionalStewardHasNoRegionError extends Error {
  constructor() {
    super(
      "This Regional Steward's own region cannot be resolved via the circleId -> regionId proxy (no circleId on file, or their circle has no region).",
    );
    this.name = "RegionalStewardHasNoRegionError";
  }
}

export interface MentorCaseloadSignal {
  readonly mentorRoleId: string;
  readonly mentorUserId: string;
  /** From `countActiveMentorCaseloadTx` -- no learner exclusion, a plain point-in-time headcount. */
  readonly activeCaseloadCount: number;
  readonly caseloadCeiling: number;
  /** How many of this Mentor's active-caseload learners are currently overdue for their Track-appropriate check-in. */
  readonly overdueCheckInCount: number;
  readonly overdueLearnerUserIds: readonly string[];
}

/**
 * The read function itself. Runs as the requesting user's own RLS-scoped
 * session -- the accompanying RLS migration's own
 * `app_actor_is_regional_steward_of_mentor_role` policy check enforces the
 * database-layer half of the same authorization this function checks at
 * the application layer, per Architecture Spec Part Six's "two layers, not
 * one."
 *
 * An Administrator caller sees every active Mentor platform-wide. A
 * Regional Steward caller sees only Mentors whose own region-proxy
 * (`circleId` -> `regionId`) matches their own -- see this module's own top
 * comment for why that match is a proxy, not a guarantee.
 */
export async function getMentorControlTowerRollup({
  requestingUserId,
  now = new Date(),
}: {
  requestingUserId: string;
  now?: Date;
}): Promise<readonly MentorCaseloadSignal[]> {
  return runAsUser(requestingUserId, async (tx) => {
    const [administratorRole, regionalStewardRole] = await Promise.all([
      tx.role.findFirst({ where: { userId: requestingUserId, roleType: "ADMINISTRATOR", validTo: null } }),
      tx.role.findFirst({ where: { userId: requestingUserId, roleType: "REGIONAL_STEWARD", validTo: null } }),
    ]);

    if (!administratorRole && !regionalStewardRole) {
      throw new NotAuthorizedForControlTowerError();
    }

    // An Administrator sees everything, even if they also happen to hold a
    // REGIONAL_STEWARD role -- platform-wide visibility is the broader
    // grant, so it takes precedence rather than the two being combined into
    // some narrower intersection.
    let requiredRegionId: string | null = null;
    if (!administratorRole && regionalStewardRole) {
      const steward = await tx.user.findUniqueOrThrow({
        where: { id: requestingUserId },
        select: { circleId: true },
      });
      const stewardCircle = steward.circleId
        ? await tx.circle.findUnique({ where: { id: steward.circleId }, select: { regionId: true } })
        : null;
      if (!stewardCircle) {
        throw new RegionalStewardHasNoRegionError();
      }
      requiredRegionId = stewardCircle.regionId;
    }

    const mentorRoles = await tx.role.findMany({
      where: { roleType: "MENTOR", validTo: null },
      select: { id: true, userId: true },
    });

    let inRegionMentorRoles = mentorRoles;
    if (requiredRegionId) {
      const mentorUsers = await tx.user.findMany({
        where: { id: { in: mentorRoles.map((role) => role.userId) } },
        select: { id: true, circleId: true },
      });
      const circleIds = [...new Set(mentorUsers.map((user) => user.circleId).filter((id): id is string => id !== null))];
      const circles = await tx.circle.findMany({ where: { id: { in: circleIds } }, select: { id: true, regionId: true } });
      const regionIdByCircleId = new Map(circles.map((circle) => [circle.id, circle.regionId]));
      const circleIdByMentorUserId = new Map(mentorUsers.map((user) => [user.id, user.circleId]));

      inRegionMentorRoles = mentorRoles.filter((role) => {
        const circleId = circleIdByMentorUserId.get(role.userId);
        const regionId = circleId ? regionIdByCircleId.get(circleId) : undefined;
        return regionId === requiredRegionId;
      });
    }

    const signals: MentorCaseloadSignal[] = [];
    for (const mentorRole of inRegionMentorRoles) {
      const activeCaseloadCount = await countActiveMentorCaseloadTx(tx, { mentorRoleId: mentorRole.id });

      const activeAssignments = await tx.mentorAssignment.findMany({
        where: { mentorRoleId: mentorRole.id, validTo: null },
        select: { learnerUserId: true, learner: { select: { track: true } } },
      });

      const overdueLearnerUserIds: string[] = [];
      for (const assignment of activeAssignments) {
        // A learner under an active MentorAssignment should always carry a
        // Track (onboardLearner requires one) -- a null here is a data
        // anomaly this rollup does not fail on, only skips, so one bad row
        // never blocks the whole reading.
        if (!assignment.learner.track) {
          continue;
        }
        const overdue = await isMentorCheckInDueTx(tx, {
          learnerUserId: assignment.learnerUserId,
          track: assignment.learner.track,
          now,
        });
        if (overdue) {
          overdueLearnerUserIds.push(assignment.learnerUserId);
        }
      }

      signals.push({
        mentorRoleId: mentorRole.id,
        mentorUserId: mentorRole.userId,
        activeCaseloadCount,
        caseloadCeiling: MENTOR_CASELOAD_CEILING,
        overdueCheckInCount: overdueLearnerUserIds.length,
        overdueLearnerUserIds,
      });
    }

    return signals;
  });
}

// Re-exported so a caller building the eventual Regional Steward-facing
// view doesn't need a second import from weekly-reflection.ts just to
// display the cadence this rollup's own overdue count is computed against.
export { MENTOR_CHECK_IN_INTERVAL_DAYS };
