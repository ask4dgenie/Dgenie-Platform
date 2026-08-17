import type { Prisma } from "@prisma/client";

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
 * false` and `toolAllowlist: []` reflect Part Nine's own framing precisely:
 * "No working conversation, no live LLM calls yet." Flipping either of those
 * on is Phase 1 work, not implied by this row's existence.
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

  // Phase 0: no live tool-calling integration exists (Part Nine non-goal).
  // A certifying action (e.g. a hypothetical `certify_genius_level`) must
  // never appear in this list for any agent, at any phase -- Architecture
  // Spec Part Five's central claim, that the boundary is what the gateway
  // does not expose.
  toolAllowlist: [] as string[],

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

  // Configuration record, not a live integration (Part Nine).
  isActive: false,
} satisfies Prisma.AgentDefinitionCreateInput;
