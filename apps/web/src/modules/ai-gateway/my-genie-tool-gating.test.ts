import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AVATAR_VOICE_LOCK_WRITE_TOOL,
  LIVE_SPEECH_TO_TEXT_TOOL,
  LIVE_VOICE_SYNTHESIS_TOOL,
  resolveEffectiveToolAllowlist,
  resolveMyGenieTier,
} from "./my-genie-tool-gating";

const ALL_MY_GENIE_TOOLS = [LIVE_SPEECH_TO_TEXT_TOOL, LIVE_VOICE_SYNTHESIS_TOOL, AVATAR_VOICE_LOCK_WRITE_TOOL];

// Architecture Spec Part Five: "does this AgentDefinition's tool allowlist
// contain a certifying action. It either does or it does not, and that can
// be checked in a unit test, not merely asserted in a document." These
// tests hold the three-tier gate to that same standard.

test("resolveMyGenieTier: under the five-year floor", () => {
  const tier = resolveMyGenieTier({ learnerAgeInYears: 4, minimumLearnerAge: 5, voiceSynthesisMinimumAge: 13 });
  assert.equal(tier, "UNDER_FIVE");
});

test("resolveMyGenieTier: exactly five years old is not under the floor", () => {
  const tier = resolveMyGenieTier({ learnerAgeInYears: 5, minimumLearnerAge: 5, voiceSynthesisMinimumAge: 13 });
  assert.equal(tier, "FIVE_TO_THIRTEEN");
});

test("resolveMyGenieTier: the five-to-thirteen band", () => {
  for (const age of [5, 8, 12]) {
    const tier = resolveMyGenieTier({ learnerAgeInYears: age, minimumLearnerAge: 5, voiceSynthesisMinimumAge: 13 });
    assert.equal(tier, "FIVE_TO_THIRTEEN", `age ${age} should be FIVE_TO_THIRTEEN`);
  }
});

test("resolveMyGenieTier: exactly thirteen years old is the top tier", () => {
  const tier = resolveMyGenieTier({ learnerAgeInYears: 13, minimumLearnerAge: 5, voiceSynthesisMinimumAge: 13 });
  assert.equal(tier, "THIRTEEN_PLUS");
});

test("resolveMyGenieTier: well above thirteen is the top tier", () => {
  const tier = resolveMyGenieTier({ learnerAgeInYears: 40, minimumLearnerAge: 5, voiceSynthesisMinimumAge: 13 });
  assert.equal(tier, "THIRTEEN_PLUS");
});

test("resolveMyGenieTier: an AgentDefinition with no floor at all (every non-My-Genie agent) has no tier", () => {
  const tier = resolveMyGenieTier({ learnerAgeInYears: 8, minimumLearnerAge: null, voiceSynthesisMinimumAge: null });
  assert.equal(tier, null);
});

test("resolveEffectiveToolAllowlist: UNDER_FIVE excludes STT, voice synthesis, and the voice lock entirely", () => {
  const allowlist = resolveEffectiveToolAllowlist({ baseToolAllowlist: ALL_MY_GENIE_TOOLS, tier: "UNDER_FIVE" });
  assert.deepEqual(allowlist, []);
});

test("resolveEffectiveToolAllowlist: FIVE_TO_THIRTEEN exposes live STT but not voice synthesis or the voice lock", () => {
  const allowlist = resolveEffectiveToolAllowlist({ baseToolAllowlist: ALL_MY_GENIE_TOOLS, tier: "FIVE_TO_THIRTEEN" });
  assert.deepEqual(allowlist, [LIVE_SPEECH_TO_TEXT_TOOL]);
  assert.ok(!allowlist.includes(LIVE_VOICE_SYNTHESIS_TOOL), "voice synthesis must not be exposed in this tier");
  assert.ok(!allowlist.includes(AVATAR_VOICE_LOCK_WRITE_TOOL), "the voice-lock write tool must not be exposed in this tier");
});

test("resolveEffectiveToolAllowlist: THIRTEEN_PLUS exposes the full base allowlist, unrestricted", () => {
  const allowlist = resolveEffectiveToolAllowlist({ baseToolAllowlist: ALL_MY_GENIE_TOOLS, tier: "THIRTEEN_PLUS" });
  assert.deepEqual(allowlist, ALL_MY_GENIE_TOOLS);
});

test("resolveEffectiveToolAllowlist: null tier (a non-My-Genie agent) passes the base allowlist through unchanged", () => {
  const someOtherAgentTools = ["suggest_lesson_adaptation", "recommend_resource"];
  const allowlist = resolveEffectiveToolAllowlist({ baseToolAllowlist: someOtherAgentTools, tier: null });
  assert.deepEqual(allowlist, someOtherAgentTools);
});

test("resolveEffectiveToolAllowlist: never adds a tool the AgentDefinition's own base allowlist didn't already list", () => {
  // Even at the top tier, this function only narrows -- it must never
  // widen. An AgentDefinition whose base allowlist simply never included
  // the voice tools (e.g. Phase 0-3's My Genie row, isActive: false, base
  // allowlist populated but nothing calls it live) sees no tools appear
  // that weren't already there.
  const allowlist = resolveEffectiveToolAllowlist({ baseToolAllowlist: [], tier: "THIRTEEN_PLUS" });
  assert.deepEqual(allowlist, []);
});
