import assert from "node:assert/strict";
import { test } from "node:test";

import { renderVoiceLockDisclosureText, VOICE_LOCK_CONSENT_NOTICE_V1 } from "./voice-lock-consent-notice";

test("VOICE_LOCK_CONSENT_NOTICE_V1: names the vendor specifically, per counsel's reply", () => {
  assert.equal(VOICE_LOCK_CONSENT_NOTICE_V1.vendorName, "Deepgram");
  assert.ok(VOICE_LOCK_CONSENT_NOTICE_V1.purpose.includes("Deepgram"));
});

test("VOICE_LOCK_CONSENT_NOTICE_V1: AI-model training is never bundled into this consent", () => {
  assert.equal(VOICE_LOCK_CONSENT_NOTICE_V1.aiTrainingDisclosure.bundledIntoThisConsent, false);
  assert.equal(VOICE_LOCK_CONSENT_NOTICE_V1.aiTrainingDisclosure.separateConsentRequired, true);
});

test("VOICE_LOCK_CONSENT_NOTICE_V1: retention policy states the one-year-since-closure-or-last-interaction floor", () => {
  assert.ok(VOICE_LOCK_CONSENT_NOTICE_V1.retentionPolicy.includes("one year"));
  assert.ok(VOICE_LOCK_CONSENT_NOTICE_V1.retentionPolicy.toLowerCase().includes("account"));
});

test("VOICE_LOCK_CONSENT_NOTICE_V1: existing safeguards are disclosed, per counsel's Question 4 answer", () => {
  assert.ok(VOICE_LOCK_CONSENT_NOTICE_V1.existingSafeguardsDisclosure.toLowerCase().includes("mentor"));
});

test("renderVoiceLockDisclosureText: is a pure function -- identical content renders identically", () => {
  const first = renderVoiceLockDisclosureText(VOICE_LOCK_CONSENT_NOTICE_V1);
  const second = renderVoiceLockDisclosureText(VOICE_LOCK_CONSENT_NOTICE_V1);
  assert.equal(first, second);
});

test("renderVoiceLockDisclosureText: the rendered text carries every required element", () => {
  const rendered = renderVoiceLockDisclosureText(VOICE_LOCK_CONSENT_NOTICE_V1);
  assert.ok(rendered.includes("Deepgram"));
  assert.ok(rendered.includes("Purpose:"));
  assert.ok(rendered.includes("Retention:"));
  assert.ok(rendered.includes("AI training:"));
});

test("renderVoiceLockDisclosureText: a different notice's own fields flow through, proving no hardcoded string is smuggled in", () => {
  const alternate = {
    ...VOICE_LOCK_CONSENT_NOTICE_V1,
    version: 2,
    vendorName: "SomeOtherVendor",
  };
  const rendered = renderVoiceLockDisclosureText(alternate);
  assert.ok(rendered.includes("SomeOtherVendor"));
  assert.ok(!rendered.includes("Vendor: Deepgram"));
});
