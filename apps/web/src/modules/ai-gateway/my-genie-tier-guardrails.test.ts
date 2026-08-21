import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assembleSystemPromptForTier,
  containsIdentifyingInfoSolicitation,
  FIVE_TO_THIRTEEN_TIER_VOICE_GUARDRAIL,
} from "./my-genie-tier-guardrails";

test("assembleSystemPromptForTier: appends the voice guardrail only for FIVE_TO_THIRTEEN", () => {
  const base = "You are My Genie.";
  const prompt = assembleSystemPromptForTier({ baseSystemPrompt: base, tier: "FIVE_TO_THIRTEEN" });
  assert.ok(prompt.startsWith(base));
  assert.ok(prompt.includes(FIVE_TO_THIRTEEN_TIER_VOICE_GUARDRAIL));
});

test("assembleSystemPromptForTier: leaves the prompt unchanged for UNDER_FIVE", () => {
  const base = "You are My Genie.";
  const prompt = assembleSystemPromptForTier({ baseSystemPrompt: base, tier: "UNDER_FIVE" });
  assert.equal(prompt, base);
});

test("assembleSystemPromptForTier: leaves the prompt unchanged for THIRTEEN_PLUS", () => {
  const base = "You are My Genie.";
  const prompt = assembleSystemPromptForTier({ baseSystemPrompt: base, tier: "THIRTEEN_PLUS" });
  assert.equal(prompt, base);
});

test("assembleSystemPromptForTier: leaves the prompt unchanged for a non-tiered agent (null)", () => {
  const base = "You are Teacher Assistant.";
  const prompt = assembleSystemPromptForTier({ baseSystemPrompt: base, tier: null });
  assert.equal(prompt, base);
});

test("containsIdentifyingInfoSolicitation: flags direct requests for a name", () => {
  assert.equal(containsIdentifyingInfoSolicitation("What's your name?"), true);
  assert.equal(containsIdentifyingInfoSolicitation("Could you tell me your name?"), true);
});

test("containsIdentifyingInfoSolicitation: flags requests for location, school, and phone number", () => {
  assert.equal(containsIdentifyingInfoSolicitation("Where do you live?"), true);
  assert.equal(containsIdentifyingInfoSolicitation("What school do you go to?"), true);
  assert.equal(containsIdentifyingInfoSolicitation("What's your phone number?"), true);
});

test("containsIdentifyingInfoSolicitation: does not flag ordinary, non-identifying conversation", () => {
  assert.equal(containsIdentifyingInfoSolicitation("What did you build today?"), false);
  assert.equal(containsIdentifyingInfoSolicitation("How did that make you feel?"), false);
  assert.equal(containsIdentifyingInfoSolicitation("Great job on your reflection!"), false);
});
