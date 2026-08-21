import assert from "node:assert/strict";
import { test } from "node:test";

import {
  avatarConfigurationVoiceDestructionTarget,
  computeDataDestructionDate,
  destroyDataForLearner,
  genieMemoryContentDestructionTarget,
  MissingDestructionBasisError,
  THIRTEEN_PLUS_TIER_VOICE_DESTRUCTION_TARGETS,
  type VoiceDataDestructionRepository,
} from "./voice-data-retention";

test("computeDataDestructionDate: formal closure, once it happens, wins over a more recent last-interaction date", () => {
  const accountClosedAt = new Date("2026-01-10T00:00:00.000Z");
  const lastRecordedInteractionAt = new Date("2026-06-01T00:00:00.000Z"); // later, but closure still wins

  const result = computeDataDestructionDate({ accountClosedAt, lastRecordedInteractionAt });

  assert.equal(result.toISOString(), "2027-01-10T00:00:00.000Z");
});

test("computeDataDestructionDate: falls back to one year after the last recorded interaction, short of formal closure", () => {
  const lastRecordedInteractionAt = new Date("2026-03-15T00:00:00.000Z");

  const result = computeDataDestructionDate({ accountClosedAt: null, lastRecordedInteractionAt });

  assert.equal(result.toISOString(), "2027-03-15T00:00:00.000Z");
});

test("computeDataDestructionDate: an actively enrolled family's date keeps sliding forward with ordinary use", () => {
  const earlierInteraction = computeDataDestructionDate({
    accountClosedAt: null,
    lastRecordedInteractionAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  const laterInteraction = computeDataDestructionDate({
    accountClosedAt: null,
    lastRecordedInteractionAt: new Date("2026-08-01T00:00:00.000Z"),
  });

  assert.ok(laterInteraction.getTime() > earlierInteraction.getTime());
});

test("computeDataDestructionDate: throws when neither date is available", () => {
  assert.throws(
    () => computeDataDestructionDate({ accountClosedAt: null, lastRecordedInteractionAt: null }),
    MissingDestructionBasisError,
  );
});

test("computeDataDestructionDate: handles a February 29 basis date across a leap-year boundary", () => {
  const result = computeDataDestructionDate({
    accountClosedAt: new Date("2028-02-29T00:00:00.000Z"),
    lastRecordedInteractionAt: null,
  });

  // 2029 is not a leap year -- Date#setFullYear rolls February 29 forward
  // to March 1, the same way a calendar (not a fixed-millisecond offset)
  // would.
  assert.equal(result.toISOString(), "2029-03-01T00:00:00.000Z");
});

function createFakeRepository() {
  const clearedVoiceFor: string[] = [];
  const repository: VoiceDataDestructionRepository = {
    async clearAvatarConfigurationVoice(learnerUserId) {
      clearedVoiceFor.push(learnerUserId);
    },
  };
  return { repository, clearedVoiceFor };
}

test("destroyDataForLearner: runs every target in the list against the given learner", async () => {
  const { repository, clearedVoiceFor } = createFakeRepository();

  await destroyDataForLearner({
    repository,
    learnerUserId: "learner-1",
    targets: THIRTEEN_PLUS_TIER_VOICE_DESTRUCTION_TARGETS,
  });

  assert.deepEqual(clearedVoiceFor, ["learner-1"]);
});

test("avatarConfigurationVoiceDestructionTarget: calls the repository's own clearing method for exactly this learner", async () => {
  const { repository, clearedVoiceFor } = createFakeRepository();

  await avatarConfigurationVoiceDestructionTarget.destroy(repository, "learner-2");

  assert.deepEqual(clearedVoiceFor, ["learner-2"]);
});

test("genieMemoryContentDestructionTarget: is a documented, harmless no-op today -- GenieMemory has no content field yet", async () => {
  const { repository, clearedVoiceFor } = createFakeRepository();

  await assert.doesNotReject(() => genieMemoryContentDestructionTarget.destroy(repository, "learner-3"));
  // Proves it touches nothing on the repository -- it is a real no-op, not
  // a stub that happens to call the wrong method.
  assert.deepEqual(clearedVoiceFor, []);
});

test("destroyDataForLearner: an empty target list is a safe no-op", async () => {
  const { repository, clearedVoiceFor } = createFakeRepository();

  await destroyDataForLearner({ repository, learnerUserId: "learner-4", targets: [] });

  assert.deepEqual(clearedVoiceFor, []);
});
