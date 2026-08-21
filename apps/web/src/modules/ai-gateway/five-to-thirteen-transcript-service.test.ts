import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIVE_TO_THIRTEEN_TIER_STT_OPTIONS,
  StubSpeechToTextProvider,
  transcribeFiveToThirteenTier,
  type FiveToThirteenTierSttOptions,
  type SpeechToTextProvider,
  type SttTranscriptionResult,
} from "./five-to-thirteen-transcript-service";

/**
 * Architecture Spec Part Five: the audio-discard guarantee "must be built
 * and tested as a hard guarantee, not a default that happens to hold
 * today." These tests hold it to that standard -- they assert on the
 * actual return value and call record, not on reading the source and
 * agreeing it looks right.
 */

test("transcribeFiveToThirteenTier: the returned object has no property other than text", async () => {
  const provider = new StubSpeechToTextProvider("hello genie");
  const audioBuffer = new Uint8Array([1, 2, 3, 4, 5]);

  const result = await transcribeFiveToThirteenTier({ provider, audioBuffer });

  assert.deepEqual(Object.keys(result), ["text"], "result must carry no field besides text");
  assert.equal(result.text, "hello genie");
});

test("transcribeFiveToThirteenTier: the original audio buffer reference is never present anywhere in the return value", async () => {
  const provider = new StubSpeechToTextProvider("some transcript");
  const audioBuffer = new Uint8Array([9, 9, 9]);

  const result = await transcribeFiveToThirteenTier({ provider, audioBuffer });

  // Deep-scan every value reachable from the result for the exact same
  // typed-array instance (or any Uint8Array at all) -- not just checking
  // that a field named "audio" is absent, but that the buffer object
  // itself was never attached anywhere in what this function hands back.
  const containsBuffer = (value: unknown, seen = new Set<unknown>()): boolean => {
    if (value === audioBuffer) return true;
    if (value instanceof Uint8Array) return true;
    if (value === null || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value as Record<string, unknown>).some((v) => containsBuffer(v, seen));
  };

  assert.equal(containsBuffer(result), false, "the audio buffer must not be reachable from the returned result");
});

test("transcribeFiveToThirteenTier: a provider that tries to leak the audio buffer back is not trusted -- only .text is ever forwarded", async () => {
  const audioBuffer = new Uint8Array([7, 7, 7]);

  // Simulates a buggy or malicious provider implementation that ignores
  // this file's own SttTranscriptionResult contract and attaches the raw
  // audio to its response anyway (a real, if non-conforming, provider
  // could still do this via `any`/JS's lack of runtime type enforcement).
  // The wrapper function must not forward it even so.
  const leakyProvider: SpeechToTextProvider = {
    async transcribe(): Promise<SttTranscriptionResult> {
      return {
        text: "transcript",
        // @ts-expect-error -- deliberately violating the interface to prove the wrapper doesn't trust it
        audio: audioBuffer,
        rawAudioBuffer: audioBuffer,
      };
    },
  };

  const result = await transcribeFiveToThirteenTier({ provider: leakyProvider, audioBuffer });

  assert.deepEqual(
    Object.keys(result),
    ["text"],
    "even a non-conforming provider's extra fields must not survive into the returned result",
  );
  assert.equal(result.text, "transcript");
});

test("transcribeFiveToThirteenTier: calls the provider with exactly one audio buffer and never calls it again", async () => {
  let callCount = 0;
  let receivedBuffer: Uint8Array | null = null;
  const provider: SpeechToTextProvider = {
    async transcribe(buffer): Promise<SttTranscriptionResult> {
      callCount += 1;
      receivedBuffer = buffer;
      return { text: "ok" };
    },
  };
  const audioBuffer = new Uint8Array([1]);

  await transcribeFiveToThirteenTier({ provider, audioBuffer });

  assert.equal(callCount, 1, "the STT provider must be called exactly once per transcription request");
  assert.equal(receivedBuffer, audioBuffer);
});

test("hardcoded diarize=false and mip_opt_out=true are passed on every call, unconditionally", async () => {
  const seenOptions: FiveToThirteenTierSttOptions[] = [];
  const provider: SpeechToTextProvider = {
    async transcribe(_buffer, options): Promise<SttTranscriptionResult> {
      seenOptions.push(options);
      return { text: "x" };
    },
  };

  await transcribeFiveToThirteenTier({ provider, audioBuffer: new Uint8Array([1]) });
  await transcribeFiveToThirteenTier({ provider, audioBuffer: new Uint8Array([2]) });

  assert.equal(seenOptions.length, 2);
  for (const options of seenOptions) {
    assert.equal(options.diarize, false);
    assert.equal(options.mipOptOut, true);
  }
});

test("the shared STT options constant is frozen -- it cannot be mutated at runtime", () => {
  // ES modules run in strict mode by default, so assigning to a frozen
  // object's property throws rather than silently failing -- this proves
  // the hardening is real at runtime, not only enforced by the type
  // checker (which the next line also violates, deliberately).
  assert.throws(() => {
    // @ts-expect-error -- diarize is typed `false`; this line exists to prove the object is frozen against a runtime bypass of that type, not just relying on the type checker
    FIVE_TO_THIRTEEN_TIER_STT_OPTIONS.diarize = true;
  }, TypeError);
});
