import type { Prisma } from "@prisma/client";

import { runAsUser } from "@/lib/db/rls";

import {
  renderVoiceLockDisclosureText,
  VOICE_LOCK_CONSENT_NOTICE_V1,
  type VoiceLockConsentNoticeContent,
} from "./voice-lock-consent-notice";

/**
 * Verifiable Parental Consent -- Architecture Spec Part Five, thirteen-and-
 * up paragraph (Nineteenth revision note) and Blueprint 07 Part Six's
 * parallel paragraph, both stating counsel's 2026-08-21 reply directly:
 * "Verifiable Parental Consent is required before collection... DGENIE
 * needs one of the more rigorous FTC-approved methods." No real VPC vendor
 * is selected yet (this task's own non-goals) -- `VerifiableParentalConsentProvider`
 * is the seam a real vendor integration plugs into later, the identical
 * pattern `SpeechToTextProvider` already established in
 * five-to-thirteen-transcript-service.ts for the STT vendor seam.
 *
 * `recordVerifiableParentalConsent` and `VerifiableParentalConsentRepository`
 * below are written against an injected repository interface rather than a
 * real Prisma transaction directly -- see voice-lock-activation.ts's own top
 * comment for why (this build environment has no network path to the live
 * Supabase database, so any function this project needs a real unit test
 * for has to be testable without one). `createPrismaVerifiableParentalConsentRepository`
 * and `recordVerifiableParentalConsentForParent` at the bottom of this file
 * are the thin, untested-here production adapter; the repository-injected
 * `recordVerifiableParentalConsent` function above them is what
 * verifiable-parental-consent.test.ts actually exercises.
 */

/**
 * Deliberately narrow, mirroring `SpeechToTextProvider`'s own shape exactly
 * -- no arguments describing *how* to verify, since that detail belongs
 * entirely to whichever real VPC vendor integration eventually implements
 * this interface, not to the enforcement logic that calls it.
 */
export interface VerifiableParentalConsentResult {
  readonly verified: boolean;
  readonly method: string;
}

export interface VerifiableParentalConsentProvider {
  verify(): Promise<VerifiableParentalConsentResult>;
}

/**
 * No network call, no vendor account -- per this task's own non-goals ("no
 * real VPC vendor integration -- build and test against the stub only").
 * Real enough to exercise the method-validation and consent-recording logic
 * below in tests; swapped for a real vendor-backed
 * `VerifiableParentalConsentProvider` once one is selected, with no change
 * required anywhere else in this file or its callers.
 */
export class StubVerifiableParentalConsentProvider implements VerifiableParentalConsentProvider {
  constructor(
    private readonly stubVerified: boolean = true,
    private readonly stubMethod: string = "KNOWLEDGE_BASED_AUTHENTICATION",
  ) {}

  async verify(): Promise<VerifiableParentalConsentResult> {
    return { verified: this.stubVerified, method: this.stubMethod };
  }
}

/** The three methods `VerifiableParentalConsentMethod` (schema.prisma) permits, and only those. */
export type ApprovedVerifiableParentalConsentMethod =
  | "KNOWLEDGE_BASED_AUTHENTICATION"
  | "PAYMENT_CARD_TRANSACTION"
  | "GOVERNMENT_ID_FACIAL_RECOGNITION";

const APPROVED_METHODS: ReadonlySet<string> = new Set<ApprovedVerifiableParentalConsentMethod>([
  "KNOWLEDGE_BASED_AUTHENTICATION",
  "PAYMENT_CARD_TRANSACTION",
  "GOVERNMENT_ID_FACIAL_RECOGNITION",
]);

/**
 * Counsel's 2026-08-21 reply, Question 1: "Because the voice data is
 * disclosed to a third party (Deepgram), the lighter 'email-plus'/'text-
 * plus' methods don't qualify." A provider reporting anything outside the
 * three approved methods -- including a lighter COPPA-internal-use-only
 * method -- is rejected here, in code, not only excluded by the database
 * enum's own membership (schema.prisma's `VerifiableParentalConsentMethod`)
 * -- the same "two layers, not one" discipline (Architecture Spec Part Six)
 * applied throughout this project.
 */
export class UnapprovedConsentMethodError extends Error {
  constructor(method: string) {
    super(
      `"${method}" is not one of the FTC's more rigorous VPC methods (counsel's 2026-08-21 reply, Question 1). Approved: ${[...APPROVED_METHODS].join(", ")}.`,
    );
    this.name = "UnapprovedConsentMethodError";
  }
}

export class NotParentOfLearnerError extends Error {
  constructor() {
    super("Only a User holding an active, unrevoked ParentLink to this learner may record consent on their behalf.");
    this.name = "NotParentOfLearnerError";
  }
}

export function parseVerifiableParentalConsentMethod(method: string): ApprovedVerifiableParentalConsentMethod {
  if (!APPROVED_METHODS.has(method)) {
    throw new UnapprovedConsentMethodError(method);
  }
  return method as ApprovedVerifiableParentalConsentMethod;
}

/** What `recordVerifiableParentalConsent` needs from storage -- see this file's own top comment. */
export interface VerifiableParentalConsentRepository {
  isActiveParentOfLearner(parentUserId: string, learnerUserId: string): Promise<boolean>;
  createConsentRecord(record: {
    parentUserId: string;
    learnerUserId: string;
    purpose: "VOICE_LOCK_ACTIVATION";
    method: ApprovedVerifiableParentalConsentMethod;
    verified: boolean;
    disclosureText: string;
  }): Promise<{ id: string }>;
}

/**
 * Records what a VPC provider reported, verified or not -- the same
 * append-only, record-the-attempt-not-only-the-success philosophy as the
 * Audit Log (Architecture Spec Part Ten). A failed verification is not
 * silently dropped; it simply never satisfies `activateVoiceLock`'s own
 * `verified: true` requirement (voice-lock-activation.ts).
 *
 * Two checks run before anything is written: the acting parent must
 * currently hold an active `ParentLink` to this specific learner (mirrored
 * at the database layer by the `verifiable_parental_consents_insert_parent`
 * RLS policy's own `app_actor_is_parent_of` check -- application-layer here,
 * database-layer there, per Part Six's "two layers, not one"), and the
 * method the provider reports must be one of the three FTC-approved
 * rigorous methods.
 */
export async function recordVerifiableParentalConsent({
  repository,
  parentUserId,
  learnerUserId,
  provider,
  noticeContent = VOICE_LOCK_CONSENT_NOTICE_V1,
}: {
  repository: VerifiableParentalConsentRepository;
  parentUserId: string;
  learnerUserId: string;
  provider: VerifiableParentalConsentProvider;
  noticeContent?: VoiceLockConsentNoticeContent;
}): Promise<{ id: string }> {
  const isParent = await repository.isActiveParentOfLearner(parentUserId, learnerUserId);
  if (!isParent) {
    throw new NotParentOfLearnerError();
  }

  const { verified, method } = await provider.verify();
  const approvedMethod = parseVerifiableParentalConsentMethod(method);

  return repository.createConsentRecord({
    parentUserId,
    learnerUserId,
    purpose: "VOICE_LOCK_ACTIVATION",
    method: approvedMethod,
    verified,
    disclosureText: renderVoiceLockDisclosureText(noticeContent),
  });
}

/** The production adapter -- thin, deliberately untested here (see this file's own top comment). */
function createPrismaVerifiableParentalConsentRepository(
  tx: Prisma.TransactionClient,
): VerifiableParentalConsentRepository {
  return {
    async isActiveParentOfLearner(parentUserId, learnerUserId) {
      const link = await tx.parentLink.findFirst({
        where: { parentUserId, minorUserId: learnerUserId, revokedAt: null },
        select: { id: true },
      });
      return link !== null;
    },
    async createConsentRecord(record) {
      return tx.verifiableParentalConsent.create({ data: record, select: { id: true } });
    },
  };
}

/**
 * The real entrypoint -- runs as the consenting parent's own RLS-scoped
 * session (`runAsUser`), so the database-layer `app_actor_is_parent_of`
 * check in the accompanying RLS migration is live, not bypassed. Nothing in
 * this codebase calls this yet (no consent UI exists -- this task's own
 * non-goals); it exists so `activateVoiceLock` (voice-lock-activation.ts)
 * has a real, tested code path that produced the consent record it checks
 * for.
 */
export async function recordVerifiableParentalConsentForParent({
  parentUserId,
  learnerUserId,
  provider,
  noticeContent,
}: {
  parentUserId: string;
  learnerUserId: string;
  provider: VerifiableParentalConsentProvider;
  noticeContent?: VoiceLockConsentNoticeContent;
}): Promise<{ id: string }> {
  return runAsUser(parentUserId, (tx) =>
    recordVerifiableParentalConsent({
      repository: createPrismaVerifiableParentalConsentRepository(tx),
      parentUserId,
      learnerUserId,
      provider,
      noticeContent,
    }),
  );
}
