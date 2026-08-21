import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NotParentOfLearnerError,
  parseVerifiableParentalConsentMethod,
  recordVerifiableParentalConsent,
  StubVerifiableParentalConsentProvider,
  UnapprovedConsentMethodError,
  type ApprovedVerifiableParentalConsentMethod,
  type VerifiableParentalConsentRepository,
} from "./verifiable-parental-consent";

function createFakeRepository(options: { isParent?: boolean } = {}) {
  const created: Array<{
    parentUserId: string;
    learnerUserId: string;
    purpose: "VOICE_LOCK_ACTIVATION";
    method: ApprovedVerifiableParentalConsentMethod;
    verified: boolean;
    disclosureText: string;
  }> = [];

  const repository: VerifiableParentalConsentRepository = {
    async isActiveParentOfLearner() {
      return options.isParent ?? true;
    },
    async createConsentRecord(record) {
      created.push(record);
      return { id: `consent-${created.length}` };
    },
  };

  return { repository, created };
}

test("parseVerifiableParentalConsentMethod: accepts all three FTC-approved rigorous methods", () => {
  assert.equal(parseVerifiableParentalConsentMethod("KNOWLEDGE_BASED_AUTHENTICATION"), "KNOWLEDGE_BASED_AUTHENTICATION");
  assert.equal(parseVerifiableParentalConsentMethod("PAYMENT_CARD_TRANSACTION"), "PAYMENT_CARD_TRANSACTION");
  assert.equal(parseVerifiableParentalConsentMethod("GOVERNMENT_ID_FACIAL_RECOGNITION"), "GOVERNMENT_ID_FACIAL_RECOGNITION");
});

test("parseVerifiableParentalConsentMethod: rejects a lighter COPPA internal-use-only method", () => {
  assert.throws(() => parseVerifiableParentalConsentMethod("EMAIL_PLUS"), UnapprovedConsentMethodError);
  assert.throws(() => parseVerifiableParentalConsentMethod("TEXT_PLUS"), UnapprovedConsentMethodError);
});

test("recordVerifiableParentalConsent: refuses to record consent from someone who is not this learner's active parent", async () => {
  const { repository } = createFakeRepository({ isParent: false });
  const provider = new StubVerifiableParentalConsentProvider();

  await assert.rejects(
    () =>
      recordVerifiableParentalConsent({
        repository,
        parentUserId: "parent-1",
        learnerUserId: "learner-1",
        provider,
      }),
    NotParentOfLearnerError,
  );
});

test("recordVerifiableParentalConsent: rejects an unapproved method even when the provider reports verified: true", async () => {
  const { repository } = createFakeRepository();
  const provider = new StubVerifiableParentalConsentProvider(true, "EMAIL_PLUS");

  await assert.rejects(
    () =>
      recordVerifiableParentalConsent({
        repository,
        parentUserId: "parent-1",
        learnerUserId: "learner-1",
        provider,
      }),
    UnapprovedConsentMethodError,
  );
});

test("recordVerifiableParentalConsent: records a successful verification with the verbatim disclosure text", async () => {
  const { repository, created } = createFakeRepository();
  const provider = new StubVerifiableParentalConsentProvider(true, "PAYMENT_CARD_TRANSACTION");

  const result = await recordVerifiableParentalConsent({
    repository,
    parentUserId: "parent-1",
    learnerUserId: "learner-1",
    provider,
  });

  assert.ok(result.id);
  assert.equal(created.length, 1);
  assert.equal(created[0].parentUserId, "parent-1");
  assert.equal(created[0].learnerUserId, "learner-1");
  assert.equal(created[0].purpose, "VOICE_LOCK_ACTIVATION");
  assert.equal(created[0].method, "PAYMENT_CARD_TRANSACTION");
  assert.equal(created[0].verified, true);
  assert.ok(created[0].disclosureText.includes("Deepgram"));
});

test("recordVerifiableParentalConsent: still records a failed verification -- append-only, not silently dropped", async () => {
  const { repository, created } = createFakeRepository();
  const provider = new StubVerifiableParentalConsentProvider(false, "KNOWLEDGE_BASED_AUTHENTICATION");

  const result = await recordVerifiableParentalConsent({
    repository,
    parentUserId: "parent-1",
    learnerUserId: "learner-1",
    provider,
  });

  assert.ok(result.id);
  assert.equal(created[0].verified, false);
});
