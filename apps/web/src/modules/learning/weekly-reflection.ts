import type { Prisma, Track } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

/**
 * Weekly Reflection -- Architecture Spec Part Seven, Workflow 3: "Cadence
 * differs by track exactly as Blueprint 04's Two-Track Delivery Model
 * specifies: continuous on the Home Track's daily structured block, and at
 * every biweekly cohort session on the Membership Track. The system prompts
 * the reflection at the appropriate cadence rather than leaving it to a
 * learner's own initiative."
 *
 * Blueprint 04 Part Thirteen's own "Cadence" text is the concrete number
 * behind that: "Home Track: the mentor meets with the learner in a short,
 * dedicated check-in at least once per week ... Membership Track: the
 * mentor meets with the learner at every biweekly session." This module
 * treats a reflection as due on the same rhythm as that check-in -- daily
 * on Home Track (Blueprint 04 Part Six's own Reflect movement happens inside
 * every Genius Cycle block), weekly-aligned in practice since the check-in
 * itself is weekly; biweekly (14 days) on Membership Track, matching the
 * cohort session interval exactly.
 */
const HOME_TRACK_REFLECTION_INTERVAL_HOURS = 24;
const MEMBERSHIP_TRACK_REFLECTION_INTERVAL_DAYS = 14;

/** Blueprint 04 Part Thirteen's "Cadence": Home Track weekly, Membership Track biweekly. */
const MENTOR_CHECK_IN_INTERVAL_DAYS: Record<Track, number> = {
  HOME: 7,
  MEMBERSHIP: 14,
};

/**
 * "The system prompts the reflection at the appropriate cadence rather than
 * leaving it to a learner's own initiative" -- this is the check a caller
 * (a scheduled job, or a page load) runs to decide whether to prompt. It is
 * a pure query, not a notification system; no background-job infrastructure
 * exists yet in this slice to actually deliver the prompt (Part Two's
 * Postgres-backed durable queue is not part of this slice's scope).
 */
export async function isReflectionDue({
  learnerUserId,
  track,
  now = new Date(),
}: {
  learnerUserId: string;
  track: Track;
  now?: Date;
}): Promise<boolean> {
  return runAsUser(learnerUserId, async (tx) => {
    const lastReflection = await tx.portfolioEntry.findFirst({
      where: { learnerUserId, entryType: "REFLECTION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!lastReflection) return true;

    const hoursSinceLastReflection = (now.getTime() - lastReflection.createdAt.getTime()) / (1000 * 60 * 60);
    const intervalHours =
      track === "HOME" ? HOME_TRACK_REFLECTION_INTERVAL_HOURS : MEMBERSHIP_TRACK_REFLECTION_INTERVAL_DAYS * 24;

    return hoursSinceLastReflection >= intervalHours;
  });
}

/** Produces a `PortfolioEntry` from the reflection itself, per Workflow 3's own text. */
export async function submitWeeklyReflection({
  learnerUserId,
  content,
}: {
  learnerUserId: string;
  content: Prisma.InputJsonValue;
}) {
  return runAsUser(learnerUserId, (tx) =>
    tx.portfolioEntry.create({
      data: {
        learnerUserId,
        entryType: "REFLECTION",
        title: "Weekly Reflection",
        content,
      },
    }),
  );
}

/**
 * Whether the learner's assigned Mentor is due for a scheduled check-in,
 * per Blueprint 04 Part Thirteen's Cadence text, checked against the most
 * recent `MentorSessionTranscript` (scheduled or completed) on file.
 */
export async function isMentorCheckInDue({
  learnerUserId,
  track,
  now = new Date(),
}: {
  learnerUserId: string;
  track: Track;
  now?: Date;
}): Promise<boolean> {
  return runAsUser(learnerUserId, async (tx) => {
    const lastSession = await tx.mentorSessionTranscript.findFirst({
      where: { learnerUserId },
      orderBy: { scheduledFor: "desc" },
      select: { scheduledFor: true },
    });
    if (!lastSession) return true;

    const daysSinceLastSession = (now.getTime() - lastSession.scheduledFor.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastSession >= MENTOR_CHECK_IN_INTERVAL_DAYS[track];
  });
}
