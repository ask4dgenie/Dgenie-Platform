/**
 * The three-tier live-interaction gate -- Architecture Spec Part Five
 * (Fourteenth/Fifteenth revision notes and the paragraphs they produced)
 * and Blueprint 07 Part Six (the corresponding binding boundary): "gated on
 * the learner's age at the AgentDefinition level, enforced ... by what the
 * gateway does not expose, not by a prompt instruction."
 *
 * This module is the literal mechanism. It does not call a model, a vendor,
 * or write to the database -- it is a pure function from (base tool
 * allowlist, learner age) to (effective tool allowlist for this call), so
 * the boundary Part Five describes is "a literal, testable property of the
 * codebase," per that Part's own words, not something asserted in a
 * comment. See my-genie-tool-gating.test.ts for the tests that hold it to
 * that standard.
 */

/**
 * Tool identifiers this task introduces into My Genie's `toolAllowlist`.
 * None of these are wired to a real vendor call yet (this task's own
 * non-goals) -- they exist so the gating logic below has real, named tools
 * to include or exclude, rather than gating an empty list that would prove
 * nothing.
 */
export const LIVE_SPEECH_TO_TEXT_TOOL = "live_speech_to_text";
export const LIVE_VOICE_SYNTHESIS_TOOL = "live_voice_synthesis";
export const AVATAR_VOICE_LOCK_WRITE_TOOL = "avatar_configuration_voice_lock_write";

/**
 * The three tiers, in the exact terms Architecture Spec Part Five and
 * Blueprint 07 Part Six describe them. `UNDER_FIVE` and `THIRTEEN_PLUS` are
 * unchanged from the original single-gate design (Eleventh revision note);
 * `FIVE_TO_THIRTEEN` is what the Fourteenth revision note added.
 */
export type MyGenieTier = "UNDER_FIVE" | "FIVE_TO_THIRTEEN" | "THIRTEEN_PLUS";

/**
 * Resolves which tier a learner's age falls into, against a given
 * `AgentDefinition`'s two threshold columns. Returns `null` when the agent
 * has no live-interaction tiering at all (`minimumLearnerAge` is null) --
 * every agent other than My Genie, per that column's own doc comment in
 * schema.prisma.
 */
export function resolveMyGenieTier({
  learnerAgeInYears,
  minimumLearnerAge,
  voiceSynthesisMinimumAge,
}: {
  learnerAgeInYears: number;
  minimumLearnerAge: number | null;
  voiceSynthesisMinimumAge: number | null;
}): MyGenieTier | null {
  if (minimumLearnerAge === null) {
    return null;
  }
  if (learnerAgeInYears < minimumLearnerAge) {
    return "UNDER_FIVE";
  }
  if (voiceSynthesisMinimumAge !== null && learnerAgeInYears < voiceSynthesisMinimumAge) {
    return "FIVE_TO_THIRTEEN";
  }
  return "THIRTEEN_PLUS";
}

/**
 * The actual gate. Architecture Spec Part Five's own words, tier by tier:
 *
 * - Below the floor: "My Genie's tool allowlist excludes the live
 *   speech-to-text and real-time voice-synthesis tools entirely."
 * - Five to thirteen: "The live speech-to-text tool is exposed ... but the
 *   real-time voice-synthesis tool is not, and the AvatarConfiguration
 *   voice-locking step ... does not run for this age band at all."
 * - Thirteen and up: "the full pipeline ... applies without restriction,
 *   including the one-time voice lock" (subject to the Eighteenth revision
 *   note's separate parental-consent-to-activate requirement for ages
 *   thirteen through seventeen -- a consent-authority question, not a
 *   capability-gate question, and out of this function's own scope).
 *
 * Takes the AgentDefinition's own stored `toolAllowlist` as the ceiling --
 * this function only ever narrows it for the calling tier, never adds a
 * tool the AgentDefinition row itself doesn't already list.
 */
export function resolveEffectiveToolAllowlist({
  baseToolAllowlist,
  tier,
}: {
  baseToolAllowlist: readonly string[];
  tier: MyGenieTier | null;
}): string[] {
  if (tier === null) {
    return [...baseToolAllowlist];
  }

  const excludedByTier: Record<MyGenieTier, readonly string[]> = {
    UNDER_FIVE: [LIVE_SPEECH_TO_TEXT_TOOL, LIVE_VOICE_SYNTHESIS_TOOL, AVATAR_VOICE_LOCK_WRITE_TOOL],
    FIVE_TO_THIRTEEN: [LIVE_VOICE_SYNTHESIS_TOOL, AVATAR_VOICE_LOCK_WRITE_TOOL],
    THIRTEEN_PLUS: [],
  };

  const excluded = new Set(excludedByTier[tier]);
  return baseToolAllowlist.filter((tool) => !excluded.has(tool));
}
