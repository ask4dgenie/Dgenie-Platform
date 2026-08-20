import type { Prisma } from "@prisma/client";

/**
 * Parent Companion's AgentDefinition -- Blueprint 14 Section Four, Agent
 * Three. Field text is reproduced from that Blueprint, the same discipline
 * Phase 0's My Genie seed followed: "Purpose, human relationship, and
 * boundary for each agent below are reproduced from the table already
 * established in Blueprint 08 Part Four; Key Functions and Data Access are
 * this Blueprint's own contribution."
 *
 * Per this phase's own "consistency decision": a real, complete
 * AgentDefinition row, but `isActive: false`, same as My Genie's own row.
 * Nothing about Parent Companion's spec touches a child's voice or
 * biometric data -- it's parent-facing, read-only on Portfolio text/artifact
 * evidence, never on `GenieMemory` or any audio -- so it isn't blocked by
 * M3 the way My Genie's pipeline is. It's deferred anyway: this build has
 * no live-agent activation precedent yet (My Genie's own row is still
 * `isActive: false`), and Parent Companion going live first, ahead of My
 * Genie itself, would be an unexplained inconsistency. It activates
 * alongside the deferred-agent slice, whenever that lands, not before it.
 */
export const parentCompanionDefinition = {
  agentKey: "parent-companion",
  name: "Parent Companion",

  // Blueprint 14 Section Four, Agent Three: "Purpose."
  purpose: "Helps a parent understand their child's Portfolio and formation.",

  // Blueprint 14 Section Four, Agent Three: "Human relationship."
  humanRelationship: "Parent.",

  // Composed from Blueprint 14 Section Four, Agent Three's "Key functions"
  // and "Boundaries" fields. Architecture Spec Part Five: this text is
  // defense in depth, not the enforcement mechanism -- see `toolAllowlist`
  // and `dataScope` below for what actually bounds this agent.
  systemPrompt: [
    "You are Parent Companion, an assistant that helps a parent understand their",
    "child's Genius Portfolio and formation on the DGENIE platform.",
    "",
    "Key functions, per Blueprint 14 Section Four: you explain Portfolio data,",
    "suggest ways a parent can support learning at home, answer questions about",
    "DGENIE, and provide the parent education resources named in Blueprint 12",
    "Sections Six and Nine.",
    "",
    "Boundaries: parenting decisions are never delegated to you. You never replace",
    "the Mentor or Teacher relationship -- you help a parent understand what is",
    "already there, you do not interpret it in the Mentor's place or advise the",
    "parent on formation judgments that belong to the family and the Mentor",
    "together.",
  ].join("\n"),

  // Phase 2: no live tool-calling integration exists (this phase's own
  // consistency decision). A write action must never appear here for any
  // agent, at any phase -- Blueprint 14 Section Four's own "Data access"
  // field for this agent is explicit that it is "read-only... never write
  // access to any learner record."
  toolAllowlist: [] as string[],

  // Blueprint 14 Section Four, Agent Three: "Data access" -- "the child's
  // Genius Portfolio, read-only, and parent education resources, never
  // write access to any learner record." Structured so the gateway's
  // context assembly (Architecture Spec Part Five) can be checked against
  // it mechanically. Deliberately excludes `GenieMemory` and any audio --
  // this agent's spec never mentions either, which is why it isn't gated by
  // M3 the way My Genie's own pipeline is.
  dataScope: {
    sources: ["child_genius_portfolio_read_only", "parent_education_resources"],
    scopedTo: "linked_parent",
    excludes: ["genie_memory", "audio", "biometric_data"],
    citation: "Blueprint 14 Section Four, Agent Three (Data access).",
  } satisfies Prisma.InputJsonValue,

  // Architecture Spec Part Five: "a model identifier, not a hardcoded model
  // call." No live calls happen while isActive is false.
  modelIdentifier: "claude-sonnet-5",

  // Blueprint 14 Section Four's age-related boundaries apply to My Genie
  // specifically (Part Five's age-five floor); Parent Companion has no
  // learner-age-gated capability of its own, since it never speaks to the
  // learner at all.
  minimumLearnerAge: null,

  // Configuration record, not a live integration -- see this file's own
  // top comment for why, even though nothing in this agent's own spec
  // requires the deferral M3 imposes on My Genie.
  isActive: false,
} satisfies Prisma.AgentDefinitionCreateInput;
