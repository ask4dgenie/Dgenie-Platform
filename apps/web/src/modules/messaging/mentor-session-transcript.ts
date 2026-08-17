import { runAsUser } from "@/lib/db/rls";

/**
 * `MentorSessionTranscript` scheduling and completion -- the shell
 * Architecture Spec Part Seven Workflow 3 (Weekly Reflection) needs for its
 * scheduled Mentor check-in step. Per this prompt's own deferred-agent
 * boundary, the actual live video/voice call tool is out of scope; these
 * functions only schedule, complete, or mark missed/cancelled a session
 * record. `transcriptText` is never written here -- see the model's own doc
 * comment in schema.prisma.
 */

export async function scheduleMentorCheckIn({
  mentorUserId,
  learnerUserId,
  mentorRoleId,
  scheduledFor,
}: {
  mentorUserId: string;
  learnerUserId: string;
  mentorRoleId: string;
  scheduledFor: Date;
}) {
  return runAsUser(mentorUserId, (tx) =>
    tx.mentorSessionTranscript.create({
      data: { learnerUserId, mentorRoleId, scheduledFor, status: "SCHEDULED" },
    }),
  );
}

export async function completeMentorCheckIn({
  mentorUserId,
  learnerUserId,
  transcriptId,
  durationMinutes,
}: {
  mentorUserId: string;
  learnerUserId: string;
  transcriptId: string;
  durationMinutes: number;
}) {
  return runAsUser(mentorUserId, (tx) =>
    tx.mentorSessionTranscript.updateMany({
      where: { id: transcriptId, learnerUserId },
      data: { status: "COMPLETED", completedAt: new Date(), durationMinutes },
    }),
  );
}

export async function markMentorCheckInMissed({
  mentorUserId,
  learnerUserId,
  transcriptId,
}: {
  mentorUserId: string;
  learnerUserId: string;
  transcriptId: string;
}) {
  return runAsUser(mentorUserId, (tx) =>
    tx.mentorSessionTranscript.updateMany({
      where: { id: transcriptId, learnerUserId },
      data: { status: "MISSED" },
    }),
  );
}
