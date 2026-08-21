/**
 * The parent-facing consent notice's structured content -- Architecture
 * Spec Part Five, thirteen-and-up paragraph (Nineteenth revision note) and
 * Blueprint 07 Part Six's parallel paragraph, both quoting counsel's
 * 2026-08-21 reply verbatim: "The consent notice itself must name that
 * vendor, state the purpose of the disclosure, and state the retention
 * policy... any future use of this data for AI-model training requires its
 * own separate consent, not bundled into the consent obtained here." A
 * fourth element comes from the same reply's Question 4 answer: "the only
 * recommendation: disclose those safeguards prominently in the parent
 * notice rather than leave them implicit."
 *
 * This module proves the *structure* captures what governance requires --
 * it is not final legal copy. The actual displayed wording still needs a
 * compliance pass before a real parent sees it, per this task's own
 * instruction to state that explicitly rather than let a plausible-looking
 * string be mistaken for reviewed copy. No enrollment or consent UI renders
 * this content anywhere yet (this task's own non-goals); nothing in this
 * codebase reads it besides its own module comment and
 * verifiable-parental-consent.ts's `disclosureText` capture, which reuses
 * `renderVoiceLockDisclosureText` at the moment of a real consent rather
 * than storing a reference to this record -- see that field's own doc
 * comment on the `VerifiableParentalConsent` model in schema.prisma for why.
 */

/**
 * `bundledIntoThisConsent` is typed as the literal `false`, not `boolean`,
 * for the same reason `FiveToThirteenTierSttOptions` hardcodes
 * `diarize`/`mipOptOut` as literal types in five-to-thirteen-transcript-
 * service.ts: the amended COPPA Rule treats AI-model training as "never
 * integral" to the service, so no future edit to this content can silently
 * fold that disclosure into this one without a compile error forcing a
 * second look.
 */
export interface VoiceLockAiTrainingDisclosure {
  readonly bundledIntoThisConsent: false;
  readonly separateConsentRequired: true;
  readonly text: string;
}

export interface VoiceLockConsentNoticeContent {
  readonly version: number;

  /** Named specifically, per counsel's reply -- never a generic "our vendor." */
  readonly vendorName: string;

  readonly purpose: string;
  readonly retentionPolicy: string;

  /** Counsel's Question 4 answer: existing safeguards disclosed prominently, not implicitly. */
  readonly existingSafeguardsDisclosure: string;

  readonly aiTrainingDisclosure: VoiceLockAiTrainingDisclosure;
}

/**
 * Version 1. Structured content only -- see this module's own top comment.
 * Retention text reuses the identical one-year floor Architecture Spec Part
 * Two already states for Birthday Voice Memento's own thirteen-and-up
 * audio form ("one retention standard for both features rather than two"),
 * per counsel's Question 2 answer.
 */
export const VOICE_LOCK_CONSENT_NOTICE_V1: VoiceLockConsentNoticeContent = {
  version: 1,

  vendorName: "Deepgram",

  purpose:
    "DGENIE will create a permanent biometric voiceprint for your child's My Genie companion voice. " +
    "This voiceprint is created and processed by our speech vendor, Deepgram, and is used only to give " +
    "your child's Genie one consistent, permanent spoken voice -- never to identify your child elsewhere, " +
    "and never shared beyond what this processing requires.",

  retentionPolicy:
    "This voiceprint, and your child's Genie conversation memory, are kept only for the life of your " +
    "family's active DGENIE account. They are destroyed within one year of your account closing, or, if " +
    "you never formally close it, within one year of your account's last recorded interaction with the " +
    "platform -- a date that keeps moving forward for as long as your family keeps using DGENIE.",

  existingSafeguardsDisclosure:
    "My Genie always connects your child back to their own human Mentor: any sign of distress, any question " +
    "about who your child is or is called to be, and any persistent difficulty is escalated to that Mentor, " +
    "never handled by the Genie alone. My Genie never produces romantic or exploitative content, and its " +
    "voice and live conversation capabilities are age-banded -- your child could not have reached this " +
    "consent step at all before age thirteen.",

  aiTrainingDisclosure: {
    bundledIntoThisConsent: false,
    separateConsentRequired: true,
    text:
      "This consent does not cover using your child's voice data to train or improve any AI model. If DGENIE " +
      "ever wants to do that, it will ask for your separate, explicit consent first.",
  },
};

/**
 * Produces the exact text a `VerifiableParentalConsent` row's
 * `disclosureText` captures verbatim at the moment of a real consent. A
 * pure function of the notice content, not a database read -- so two calls
 * against the same `notice` argument always render identically, which is
 * exactly the property `disclosureText`'s own "captured verbatim, not a
 * template reference" design depends on.
 */
export function renderVoiceLockDisclosureText(notice: VoiceLockConsentNoticeContent): string {
  return [
    `Vendor: ${notice.vendorName}`,
    `Purpose: ${notice.purpose}`,
    `Retention: ${notice.retentionPolicy}`,
    `Existing safeguards: ${notice.existingSafeguardsDisclosure}`,
    `AI training: ${notice.aiTrainingDisclosure.text}`,
  ].join("\n\n");
}
