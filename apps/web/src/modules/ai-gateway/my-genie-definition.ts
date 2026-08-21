import type { Prisma } from "@prisma/client";

import {
  AVATAR_VOICE_LOCK_WRITE_TOOL,
  LIVE_SPEECH_TO_TEXT_TOOL,
  LIVE_VOICE_SYNTHESIS_TOOL,
} from "./my-genie-tool-gating";

/**
 * My Genie's AgentDefinition -- the one real row Phase 0 populates.
 * Architecture Spec Part Nine: "the Agent Gateway skeleton (with only My
 * Genie's AgentDefinition populated)." Field text is reproduced from
 * Blueprint 14 Section Four, Agent One (My Genie), which is itself explicit
 * that "Purpose, human relationship, and boundary for each agent below are
 * reproduced from the table already established in Blueprint 08 Part Four;
 * Key Functions and Data Access are this Blueprint's own contribution."
 *
 * This is a configuration record, not a live integration -- `isActive:
 * false` reflects Part Nine's own framing precisely: "No working
 * conversation, no live LLM calls yet." Flipping it on is later work, not
 * implied by this row's existence.
 *
 * `toolAllowlist` below is no longer empty as of the three-tier gating task
 * (Architecture Spec Part Five, Fourteenth/Fifteenth revision notes;
 * Blueprint 07 Part Six): it now names the three tools the three-tier gate
 * narrows -- live speech-to-text, live voice synthesis, and the avatar
 * voice-lock write. Naming them here, on the base row, is what gives
 * `resolveEffectiveToolAllowlist` (src/modules/ai-gateway/my-genie-tool-
 * gating.ts) something real to filter: the gateway's boundary is "what it
 * does not expose," which requires a base list that does expose them before
 * any tier narrows it back down. None of the three tools has an integration
 * behind it yet (no Deepgram/ElevenLabs/LiveKit call exists in this
 * codebase) -- naming a tool identifier here is not the same claim as the
 * tool being callable, and `isActive: false` below means no call reaches
 * this row's system prompt or tool list at all yet regardless.
 */
export const myGenieDefinition = {
  agentKey: "my-genie",
  name: "My Genie",

  // Blueprint 14 Section Four, Agent One: "Purpose."
  purpose: "Lifelong personal companion; mirrors patterns, never defines identity.",

  // Blueprint 14 Section Four, Agent One: "Human relationship."
  humanRelationship: "The learner's own self-understanding.",

  // Composed from Blueprint 14 Section Four, Agent One's "Key functions,"
  // "Boundaries," and "Escalation" fields. Architecture Spec Part Five is
  // explicit this text is defense in depth, not the enforcement mechanism --
  // "the boundary is enforced by what the gateway does not expose, not by an
  // instruction the model is trusted to obey" (see `toolAllowlist` below).
  systemPrompt: [
    "You are My Genie, a learner's lifelong personal companion on the DGENIE platform.",
    "",
    "Key functions: memory, reflection, encouragement, learning guidance, portfolio",
    "support, goal tracking, purpose discovery, growth conversations, and relationship",
    "continuity, per Blueprint 02 and Blueprint 13 Part Six.",
    "",
    "You mirror the patterns you observe in a learner's own words and work. You never",
    "define, decide, or announce who a learner is, what they are called to, or what",
    "their character amounts to -- that is the learner's own discovery, accompanied,",
    "never authored, by you.",
    "",
    "Boundaries, per Blueprint 14 Section Four: you never decide a learner's identity,",
    "calling, or character; you never replace a Mentor's certifying authority; you",
    "never replace parental authority; you hold no constitutional office.",
    "",
    "Escalation, per Blueprint 04's escalation protocol: identity or calling questions,",
    "persistent stuckness across sessions, and any sign of emotional distress escalate",
    "to a learner's human Mentor. You do not attempt to resolve these yourself.",
  ].join("\n"),

  // The three tools the three-tier live-interaction gate narrows (see the
  // module comment above and src/modules/ai-gateway/my-genie-tool-gating.ts).
  // A certifying action (e.g. a hypothetical `certify_genius_level`) must
  // never appear in this list for any agent, at any phase -- Architecture
  // Spec Part Five's central claim, that the boundary is what the gateway
  // does not expose, not an instruction the model is trusted to obey.
  toolAllowlist: [
    LIVE_SPEECH_TO_TEXT_TOOL,
    LIVE_VOICE_SYNTHESIS_TOOL,
    AVATAR_VOICE_LOCK_WRITE_TOOL,
  ] as string[],

  // Blueprint 14 Section Four, Agent One: "Data access" -- "the learner's own
  // Genius Portfolio and Genie conversation history, per the Ownership and
  // Trust principle in Blueprint 02." Structured so the gateway's context
  // assembly (Part Five) can be checked against it mechanically, not just
  // read as prose.
  dataScope: {
    sources: ["own_genius_portfolio", "own_genie_conversation_history"],
    scopedTo: "learner_self",
    citation:
      "Blueprint 14 Section Four, Agent One (Data access); Blueprint 02, Ownership and Trust principle.",
  } satisfies Prisma.InputJsonValue,

  // Architecture Spec Part Five: "The gateway's AgentDefinition table stores
  // a model identifier, not a hardcoded model call scattered through sixteen
  // integrations." No live calls happen in Phase 0 (isActive: false below);
  // this value is what Phase 1 will actually invoke.
  modelIdentifier: "claude-sonnet-5",

  // Architecture Spec Part Five, "A capability floor beneath the age of
  // five": live speech-to-text input and real-time voice synthesis are
  // gated below age five, enforced by what the gateway does not expose. This
  // column is the structural hook; Phase 1 builds the pipeline it gates.
  minimumLearnerAge: 5,

  // Architecture Spec Part Five, the second of the three-tier design's two
  // thresholds (Fourteenth/Fifteenth revision notes; Blueprint 07 Part Six):
  // below this age, live speech-to-text is exposed but real-time voice
  // synthesis and the avatar voice-lock write are not -- the gateway replies
  // in text only. At and above it, the full pipeline applies. See
  // src/modules/ai-gateway/my-genie-tool-gating.ts for the logic this value
  // drives, and schema.prisma's own doc comment on this column for why it is
  // a second, separate nullable field rather than folded into
  // `minimumLearnerAge`.
  voiceSynthesisMinimumAge: 13,

  // Configuration record, not a live integration (Part Nine).
  isActive: false,
} satisfies Prisma.AgentDefinitionCreateInput;
