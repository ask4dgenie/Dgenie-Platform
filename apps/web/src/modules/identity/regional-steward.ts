import type { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

export class AlreadyARegionalStewardError extends Error {
  constructor(stewardUserId: string) {
    super(`User ${stewardUserId} already holds an active REGIONAL_STEWARD Role.`);
    this.name = "AlreadyARegionalStewardError";
  }
}

/**
 * Grants the `REGIONAL_STEWARD` role -- Blueprint 08 Part One, Section
 * Three: "Regional Stewards ... hold delegated authority over a Regional
 * Community as mapped in Blueprint 06 ... a Regional Steward also monitors
 * the Mentor Control Tower." Part Two's own succession text says Regional
 * Stewards "are appointed by the Chief Community Officer, with Board
 * confirmation" -- this codebase has no schema representation of the Chief
 * Community Officer or a Board confirmation step, the same "Administrator
 * attests on the constitutional office's behalf" scope boundary
 * certify-new-mentor.ts already established for the Chief Educational
 * Architect, applied here identically.
 *
 * Unlike New Mentor Certification, this task's own instruction is explicit:
 * grant this "the same way MENTOR is granted via certify-new-mentor.ts in
 * spirit but not in ceremony -- governance names no attestation or
 * Teacher-Creed-equivalent step for this office, so a simple Administrator-
 * granted role assignment is faithful here." No qualifications-confirmed or
 * Creed-affirmed parameter exists on this function, deliberately -- inventing
 * one would be inventing a certification ritual the source text doesn't ask
 * for. Audit-logged via the generic `ROLE_GRANTED` event, the same one New
 * Learner Onboarding's own LEARNER-role grant already uses, not a dedicated
 * event type -- this grant carries no certification ceremony worth its own
 * event kind the way `MENTOR_CERTIFIED`'s qualifications/Creed attestation
 * did.
 */
export async function grantRegionalSteward({
  administratorUserId,
  stewardUserId,
  notes,
}: {
  administratorUserId: string;
  stewardUserId: string;
  notes?: string;
}) {
  return runAsUser(administratorUserId, async (tx) => {
    const existing = await tx.role.findFirst({
      where: { userId: stewardUserId, roleType: "REGIONAL_STEWARD", validTo: null },
    });
    if (existing) {
      throw new AlreadyARegionalStewardError(stewardUserId);
    }

    const role = await tx.role.create({
      data: {
        userId: stewardUserId,
        roleType: "REGIONAL_STEWARD",
        grantedByUserId: administratorUserId,
        notes,
      },
    });

    await tx.auditLogEntry.create({
      data: {
        eventType: "ROLE_GRANTED",
        actorUserId: administratorUserId,
        targetUserId: stewardUserId,
        summary: "REGIONAL_STEWARD role granted (Blueprint 08 Part One, Section Three).",
        metadata: { roleId: role.id } satisfies Prisma.InputJsonValue,
      },
    });

    return role;
  });
}
