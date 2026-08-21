import type { Prisma } from "@prisma/client";

/**
 * Teacher Assistant's AgentDefinition -- Blueprint 14 Section Four, Agent
 * Two. Field text is reproduced from that Blueprint, the same discipline
 * every prior agent seed in this build has followed: "Purpose, human
 * relationship, and boundary for each agent below are reproduced from the
 * table already established in Blueprint 08 Part Four; Key Functions and
 * Data Access are this Blueprint's own contribution."
 *
 * Per this task's own "consistency decision": a real, complete
 * AgentDefinition row, but `isActive: false`, same as My Genie's and Parent
 * Companion's own rows. Nothing about Teacher Assistant is legally blocked
 * -- it's parent-of-the-classroom-facing, not a child's voice or biometric
 * surface -- but activating it first, ahead of My Genie, would be the same
 * unexplained inconsistency Phase 2's own kickoff prompt already reasoned
 * through for Parent Companion. When live-agent wiring happens, whichever
 * agents go live do so together, not one at a time by whoever finished
 * first.
 */
export const teacherAssistantDefinition = {
  agentKey: "teacher-assistant",
  name: "Teacher Assistant",

  // Blueprint 14 Section Four, Agent Two: "Purpose."
  purpose: "Supports lesson planning and in-cycle differentiation.",

  // Blueprint 14 Section Four, Agent Two: "Human relationship."
  humanRelationship: "Teacher and Learning Coach.",

  // Composed from Blueprint 14 Section Four, Agent Two's "Key functions"
  // and "Boundaries" fields. Architecture Spec Part Five: this text is
  // defense in depth, not the enforcement mechanism -- see `toolAllowlist`
  // and `dataScope` below for what actually bounds this agent.
  systemPrompt: [
    "You are Teacher Assistant, supporting a Teacher's or Learning Coach's lesson",
    "planning and in-cycle differentiation on the DGENIE platform.",
    "",
    "Key functions, per Blueprint 14 Section Four: you suggest lesson adaptations,",
    "recommend resources matched to a learner's Genius Level Profile, track progress,",
    "and provide differentiation options consistent with Blueprint 04.",
    "",
    "Boundaries: instructional judgment and every final adaptation decision remain the",
    "Teacher's. You surface options and information; you never decide what a Teacher",
    "should teach, how, or to whom.",
  ].join("\n"),

  // Phase 0 through this task: no live tool-calling integration exists for
  // any agent yet (this task's own consistency decision). A certifying or
  // otherwise decision-making action must never appear here for any agent,
  // at any phase -- Blueprint 14 Section Four's own "Boundaries" field for
  // this agent is explicit that "every final adaptation decision remain[s]
  // the Teacher's."
  toolAllowlist: [] as string[],

  // Blueprint 14 Section Four, Agent Two: "Data access" -- "the learner's
  // Genius Level Profile, curriculum resources, and lesson history, never
  // data beyond a Teacher's own instructional relationship." Structured so
  // the gateway's context assembly (Architecture Spec Part Five) can be
  // checked against it mechanically.
  dataScope: {
    sources: ["learner_genius_level_profile", "curriculum_resources", "lesson_history"],
    scopedTo: "teachers_own_instructional_relationship",
    citation: "Blueprint 14 Section Four, Agent Two (Data access).",
  } satisfies Prisma.InputJsonValue,

  // Architecture Spec Part Five: "a model identifier, not a hardcoded model
  // call." No live calls happen while isActive is false.
  modelIdentifier: "claude-sonnet-5",

  // Teacher Assistant has no learner-age-gated capability of its own -- the
  // three-tier design (Part Five, Fourteenth/Fifteenth revision notes) is
  // specific to My Genie's own live voice pipeline. Teacher Assistant never
  // speaks to a learner directly at all.
  minimumLearnerAge: null,
  voiceSynthesisMinimumAge: null,

  // Configuration record, not a live integration -- see this file's own
  // top comment for why.
  isActive: false,
} satisfies Prisma.AgentDefinitionCreateInput;
