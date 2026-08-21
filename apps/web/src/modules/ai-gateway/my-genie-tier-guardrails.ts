import type { MyGenieTier } from "./my-genie-tool-gating";

/**
 * The five-to-thirteen tier's own prompt guardrail -- the build-side
 * prerequisite named in `MY GENIE 5-12 TIER — TRANSIENT VOICE INPUT LEGAL
 * BRIEFING FOR COUNSEL.md`'s "Remaining action items": "LLM system-prompt
 * guardrails preventing the Genie from soliciting a spoken name, location,
 * or other identifying detail from a learner in this band." This is the
 * same limitation the briefing's own Established Facts section names as
 * the FTC's 2017 Enforcement Policy Statement's first limit on the
 * transcribe-and-discard exception: "[n]ot applicable if the operator
 * requests other personal information via voice."
 *
 * Two layers exist for this guardrail, and the PR description for this
 * change says so explicitly rather than leaving it ambiguous, per this
 * task's own instruction:
 *
 * 1. **Primary: this prompt instruction.** Appended to My Genie's base
 *    `systemPrompt` only when serving a `FIVE_TO_THIRTEEN`-tier learner
 *    (see `assembleSystemPromptForTier` below) -- not baked into the single
 *    static `AgentDefinition.systemPrompt` column, since the under-five and
 *    thirteen-plus tiers have no reason to carry an instruction about
 *    voice-solicited identifying detail that only applies to the middle
 *    tier's live-STT surface.
 * 2. **Secondary, imperfect backstop: `containsIdentifyingInfoSolicitation`
 *    below.** A heuristic scan over a candidate response's text for
 *    patterns that ask a learner to state a name, address, school, or
 *    similar. This is pattern-matching over free-form model output, not a
 *    precise boolean check the way the tool-allowlist gate is -- it will
 *    have both false negatives (a rephrased solicitation it doesn't
 *    recognize) and false positives (an innocent question it wrongly
 *    flags). It exists as defense in depth, matching this build's own
 *    "two layers, not one" discipline (Architecture Spec Part Six) applied
 *    here to a prompt-level rather than a database-level boundary, not as
 *    a claim that it can substitute for the prompt instruction or catch
 *    everything the instruction might miss.
 *
 * No live gateway invocation exists yet to actually call either of these
 * (this task's own non-goals), so there is no code path today where a real
 * model response reaches the heuristic check -- it is built and tested as
 * a standalone function, ready for the (future) live-gateway slice to call
 * on every FIVE_TO_THIRTEEN-tier response before it reaches a learner.
 */
export const FIVE_TO_THIRTEEN_TIER_VOICE_GUARDRAIL = [
  "This learner is between five and thirteen years old and may be speaking to you;",
  "their speech is transcribed to text before it reaches you, per the platform's",
  "five-to-thirteen voice tier.",
  "",
  "Never ask this learner to say or type their full name, home address, school name,",
  "phone number, or any other identifying detail. If the learner volunteers such",
  "information unprompted, do not repeat it back, do not ask a follow-up question that",
  "would draw out more of it, and gently steer the conversation elsewhere.",
].join("\n");

/**
 * Appends the tier-specific guardrail to My Genie's base `systemPrompt`
 * only for the tier it applies to. The under-five tier serves pre-authored
 * content rather than open-ended conversation at all (Part Five's own
 * text), and the thirteen-plus tier's own legal briefing is separate and
 * unanswered -- neither needs this specific instruction appended.
 */
export function assembleSystemPromptForTier({
  baseSystemPrompt,
  tier,
}: {
  baseSystemPrompt: string;
  tier: MyGenieTier | null;
}): string {
  if (tier !== "FIVE_TO_THIRTEEN") {
    return baseSystemPrompt;
  }
  return `${baseSystemPrompt}\n\n${FIVE_TO_THIRTEEN_TIER_VOICE_GUARDRAIL}`;
}

/**
 * The secondary, imperfect output-side heuristic described above. Flags a
 * candidate response as a probable identifying-detail solicitation if it
 * asks the learner to state their name, address, school, or phone number.
 * Deliberately conservative in what it matches (a small, explicit pattern
 * list) rather than an attempt at exhaustive natural-language
 * understanding -- see this file's own top comment for why it is a
 * backstop, not the primary defense.
 */
const IDENTIFYING_DETAIL_SOLICITATION_PATTERNS: readonly RegExp[] = [
  /what('?s| is) your (full |real )?name/i,
  /(can|could|will) you (tell|say) me your name/i,
  /where do you live/i,
  /what('?s| is) your (home )?address/i,
  /what school do you (go to|attend)/i,
  /what('?s| is) the name of your school/i,
  /what('?s| is) your (phone|home) number/i,
  /can you spell your name/i,
];

export function containsIdentifyingInfoSolicitation(responseText: string): boolean {
  return IDENTIFYING_DETAIL_SOLICITATION_PATTERNS.some((pattern) => pattern.test(responseText));
}
