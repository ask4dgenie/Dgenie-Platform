/**
 * The five-to-thirteen tier's speech-to-text path -- Architecture Spec Part
 * Five (paragraph following the Fourteenth revision note): "the audio
 * buffer is discarded the instant a transcript is produced, never written
 * to any log, cache, or the AgentInteraction record itself ... This is not
 * an optimization; it is the specific technical condition `MY GENIE 5-12
 * TIER — TRANSIENT VOICE INPUT LEGAL BRIEFING FOR COUNSEL.md` identifies as
 * load-bearing for whether this tier needs a separate biometric consent
 * flow at all, and must be built and tested as a hard guarantee, not a
 * default that happens to hold today."
 *
 * No real vendor call exists here (this task's own non-goals -- the
 * Deepgram DPA named throughout the legal briefing is not yet
 * countersigned). `SpeechToTextProvider` is the seam a real Deepgram
 * integration plugs into later without touching anything below it -- the
 * gating and discard logic this file exists to prove correct do not change
 * when the stub is swapped for a real vendor call.
 */

/**
 * Hardcoded, not configurable. Counsel's confirmed condition (`MY GENIE
 * 5-12 TIER — TRANSIENT VOICE INPUT LEGAL BRIEFING FOR COUNSEL.md`,
 * "Remaining action items"): "`diarize=false` and `mip_opt_out=true`
 * hardcoded into every 5-12-tier API call, not left to convention." The
 * literal types below (`false`, `true` -- not `boolean`) make this a
 * TypeScript compile error to violate, not a runtime default a future
 * developer could quietly flip: no value other than `false`/`true` is
 * assignable to this shape, and `Object.freeze` stops the singleton itself
 * from being mutated. This is as strong a hardcoding as this build can
 * offer without a real vendor SDK to bind against.
 */
export interface FiveToThirteenTierSttOptions {
  readonly diarize: false;
  readonly mipOptOut: true;
}

export const FIVE_TO_THIRTEEN_TIER_STT_OPTIONS: FiveToThirteenTierSttOptions = Object.freeze({
  diarize: false,
  mipOptOut: true,
});

/**
 * The seam a real STT vendor (Deepgram, per `TTS STT WEBRTC VENDOR RESEARCH
 * AND RECOMMENDATION.md`) plugs into. Deliberately narrow: a provider may
 * only ever hand back `{ text }`, never the audio it was given, never any
 * provider-internal artifact (a request id, a raw response body) that
 * could carry audio bytes or a derived voice template forward. This
 * interface shape is itself part of the discard guarantee -- there is no
 * field on `SttTranscriptionResult` for a conforming provider to smuggle
 * audio through even if it wanted to.
 */
export interface SttTranscriptionResult {
  readonly text: string;
}

export interface SpeechToTextProvider {
  transcribe(audioBuffer: Uint8Array, options: FiveToThirteenTierSttOptions): Promise<SttTranscriptionResult>;
}

/**
 * A stub implementation -- no network call, no vendor account, per this
 * task's own non-goals. Real enough to exercise the gating and discard
 * logic in tests; swapped for a real Deepgram-backed `SpeechToTextProvider`
 * once the DPA is countersigned, with no change required anywhere else in
 * this file or its callers.
 */
export class StubSpeechToTextProvider implements SpeechToTextProvider {
  constructor(private readonly stubTranscriptText: string = "") {}

  async transcribe(): Promise<SttTranscriptionResult> {
    return { text: this.stubTranscriptText };
  }
}

/**
 * The only shape this function is allowed to return. `text` is the sole
 * field -- no `audio`, no `buffer`, no raw provider response -- so the
 * discard guarantee is a property of the type system, not only of this
 * function's own internal discipline.
 */
export interface FiveToThirteenTranscriptResult {
  readonly text: string;
}

/**
 * Runs the five-to-thirteen tier's transcription step. The audio buffer
 * the caller passes in is used for exactly one call to `provider.transcribe`
 * and is never referenced again by this function -- not logged, not
 * cached, not attached to the return value, not passed to any other
 * function. The returned object carries only the resulting text, matching
 * `AgentInteraction.requestText`'s own shape for a typed exchange
 * (Architecture Spec Part Five: "the gateway receives text ... speaking and
 * typing are ... two different front doors onto the exact same gateway
 * call").
 */
export async function transcribeFiveToThirteenTier({
  provider,
  audioBuffer,
}: {
  provider: SpeechToTextProvider;
  audioBuffer: Uint8Array;
}): Promise<FiveToThirteenTranscriptResult> {
  const result = await provider.transcribe(audioBuffer, FIVE_TO_THIRTEEN_TIER_STT_OPTIONS);
  return { text: result.text };
}
