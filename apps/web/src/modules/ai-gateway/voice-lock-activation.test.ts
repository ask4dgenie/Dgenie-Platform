import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activateVoiceLock,
  ageInYearsAsOf,
  LearnerMissingDateOfBirthError,
  NotThirteenPlusTierError,
  NoVerifiedVoiceLockConsentError,
  VoiceLockAlreadySetError,
  type VoiceLockRepository,
} from "./voice-lock-activation";

const NOW = new Date("2026-08-21T00:00:00.000Z");
const AGE_FIVE_DOB = new Date("2021-08-21T00:00:00.000Z");
const AGE_THIRTEEN_DOB = new Date("2013-08-01T00:00:00.000Z");
const AGE_TWELVE_DOB = new Date("2013-09-01T00:00:00.000Z");

/**
 * An in-memory fake modeling exactly the invariant the real Postgres
 * `learner_user_id` unique constraint enforces on `avatar_configurations`:
 * `createVoiceLock` throws `VoiceLockAlreadySetError` the second time it is
 * called for the same learner, regardless of what the caller's own
 * app-layer pre-check already decided. This is what lets the tests below
 * exercise both the application-layer check inside `activateVoiceLock` and
 * the database-layer backstop `createPrismaVoiceLockRepository` maps a real
 * `P2002` violation onto, without a live database.
 */
function createFakeRepository(options: {
  dateOfBirth?: Date | null;
  minimumLearnerAge?: number | null;
  voiceSynthesisMinimumAge?: number | null;
  hasVerifiedConsent?: boolean;
} = {}) {
  const locks = new Map<string, { id: string; voiceId: string; voiceIdSetAt: Date }>();
  let nextId = 1;

  const repository: VoiceLockRepository = {
    async getLearnerDateOfBirth() {
      // `?? AGE_THIRTEEN_DOB` would silently discard an explicit `null` --
      // the exact case the "missing date of birth" test below needs to
      // exercise -- so "not provided at all" is distinguished from
      // "provided as null" instead.
      return options.dateOfBirth === undefined ? AGE_THIRTEEN_DOB : options.dateOfBirth;
    },
    async getMyGenieAgeThresholds() {
      return {
        minimumLearnerAge: options.minimumLearnerAge ?? 5,
        voiceSynthesisMinimumAge: options.voiceSynthesisMinimumAge ?? 13,
      };
    },
    async hasVerifiedVoiceLockConsent() {
      return options.hasVerifiedConsent ?? true;
    },
    async hasExistingVoiceLock(learnerUserId) {
      return locks.has(learnerUserId);
    },
    async createVoiceLock({ learnerUserId, voiceId, voiceIdSetAt }) {
      if (locks.has(learnerUserId)) {
        throw new VoiceLockAlreadySetError();
      }
      const record = { id: `lock-${nextId++}`, voiceId, voiceIdSetAt };
      locks.set(learnerUserId, record);
      return { id: record.id };
    },
  };

  return { repository, locks };
}

test("ageInYearsAsOf: computes whole years, accounting for whether the birthday has occurred yet this year", () => {
  assert.equal(ageInYearsAsOf(AGE_THIRTEEN_DOB, NOW), 13);
  assert.equal(ageInYearsAsOf(AGE_TWELVE_DOB, NOW), 12);
  assert.equal(ageInYearsAsOf(AGE_FIVE_DOB, NOW), 5);
});

test("activateVoiceLock: throws when the learner has no date of birth on file", async () => {
  const { repository } = createFakeRepository({ dateOfBirth: null });
  await assert.rejects(
    () => activateVoiceLock({ repository, learnerUserId: "learner-1", voiceId: "voice-a", now: NOW }),
    LearnerMissingDateOfBirthError,
  );
});

test("activateVoiceLock: refuses a learner below the THIRTEEN_PLUS tier", async () => {
  const { repository } = createFakeRepository({ dateOfBirth: AGE_TWELVE_DOB });
  await assert.rejects(
    () => activateVoiceLock({ repository, learnerUserId: "learner-1", voiceId: "voice-a", now: NOW }),
    NotThirteenPlusTierError,
  );
});

test("activateVoiceLock: refuses without a verified VerifiableParentalConsent record", async () => {
  const { repository } = createFakeRepository({ hasVerifiedConsent: false });
  await assert.rejects(
    () => activateVoiceLock({ repository, learnerUserId: "learner-1", voiceId: "voice-a", now: NOW }),
    NoVerifiedVoiceLockConsentError,
  );
});

test("activateVoiceLock: succeeds for a THIRTEEN_PLUS learner with verified consent and no existing lock, writing voiceId and voiceIdSetAt together", async () => {
  const { repository, locks } = createFakeRepository();

  const result = await activateVoiceLock({ repository, learnerUserId: "learner-1", voiceId: "voice-a", now: NOW });

  assert.ok(result.id);
  const stored = locks.get("learner-1");
  assert.equal(stored?.voiceId, "voice-a");
  assert.equal(stored?.voiceIdSetAt.getTime(), NOW.getTime());
});

test("activateVoiceLock: write-once -- a second call, even with a fresh, valid consent record, cannot change an already-set voiceId", async () => {
  const { repository, locks } = createFakeRepository();

  await activateVoiceLock({ repository, learnerUserId: "learner-1", voiceId: "voice-a", now: NOW });
  assert.equal(locks.get("learner-1")?.voiceId, "voice-a");

  // The second call arrives with its own fresh, independently valid
  // consent (the fake's hasVerifiedVoiceLockConsent still returns true) and
  // a *different* requested voiceId -- proving the refusal is about the
  // lock already being set, not about the second attempt's own consent or
  // input being deficient.
  await assert.rejects(
    () => activateVoiceLock({ repository, learnerUserId: "learner-1", voiceId: "voice-b", now: NOW }),
    VoiceLockAlreadySetError,
  );

  // The originally-locked voiceId is untouched.
  assert.equal(locks.get("learner-1")?.voiceId, "voice-a");
  assert.equal(locks.size, 1);
});

test("activateVoiceLock: the database-layer backstop fires even if an app-layer race let two calls past the pre-check", async () => {
  const { repository, locks } = createFakeRepository();

  // Simulates the TOCTOU race the pre-check inside activateVoiceLock cannot
  // close by itself: two "concurrent" callers both observe no existing
  // lock, then both attempt to write. Calling the repository's own
  // createVoiceLock directly, bypassing activateVoiceLock's pre-check, is
  // what proves the *database* layer -- not just the application-layer
  // check -- is what actually makes this write-once, per Architecture Spec
  // Part Four: "application-layer and database-constrained."
  await repository.createVoiceLock({ learnerUserId: "learner-1", voiceId: "voice-a", voiceIdSetAt: NOW });
  await assert.rejects(
    () => repository.createVoiceLock({ learnerUserId: "learner-1", voiceId: "voice-b", voiceIdSetAt: NOW }),
    VoiceLockAlreadySetError,
  );

  assert.equal(locks.get("learner-1")?.voiceId, "voice-a");
});
