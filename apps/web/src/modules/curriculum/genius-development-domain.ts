import type { Prisma } from "@prisma/client";

/**
 * The single domain this slice populates with real content, per the
 * Roadmap's own Phase 1 framing ("single domain, to prove the model") --
 * Domain Nine, Genius Development, chosen directly with Duncan rather than
 * guessed (see the Phase 1 Slice A PR description). Content is reproduced
 * from Blueprint 04 Part Two's own domain description, not paraphrased:
 * "Every learner receives personalised opportunities to develop unique
 * talents, pursue passion projects, receive mentoring, build a Genius
 * Portfolio, explore future calling, and develop mastery. This domain
 * ensures that no learner's gifts remain undiscovered or undeveloped."
 *
 * Locale "en" only this slice -- the schema's `locale` column on every
 * curriculum-module table is what makes a French or Indigenous-language
 * variant a first-class row later (Architecture Spec Part Four; Part Eight's
 * internationalization requirement), not something this slice needs to
 * populate to prove the model works.
 */
export const geniusDevelopmentDomain = {
  code: "GENIUS_DEVELOPMENT",
  locale: "en",
  name: "Genius Development",
  description:
    "Every learner receives personalised opportunities to develop unique talents, pursue passion projects, receive mentoring, build a Genius Portfolio, explore future calling, and develop mastery. This domain ensures that no learner's gifts remain undiscovered or undeveloped.",
} satisfies Omit<Prisma.CurriculumDomainCreateInput, "code"> & { code: "GENIUS_DEVELOPMENT" };

/**
 * The Discovery Project playbook, matched to Domain Nine's own description
 * above -- both are about a learner exploring a genuine personal interest or
 * emerging gift. `purpose`, `structure`, and `evidenceStandard` are
 * reproduced verbatim from Blueprint 04 Part Ten's "Signature Experience
 * playbooks" section.
 */
export const discoveryProjectPlaybook = {
  type: "DISCOVERY_PROJECT" as const,
  locale: "en",
  purpose:
    "Exploring a personal interest or an emerging gift, typically the first formal project a learner completes, common in Chapter One and early Chapter Two.",
  structure:
    "The Genie and mentor help the learner pick a genuine personal question, not an assigned topic; the learner explores it across at least two sessions; the outcome is a short, honest account of what they found, including what surprised them.",
  evidenceStandard: "The account must include one thing the learner did not expect to learn.",
};

/**
 * Blueprint 04 Part Four's twelve Genius Levels, reproduced per-level rather
 * than paraphrased. Each level's own "Earned when ..." text is already
 * domain-agnostic personal-development evidence in Blueprint 04's own
 * wording, which is why it transfers directly to Domain Nine (Genius
 * Development) without inventing new domain-specific rubric text -- see the
 * `GeniusLevelRubric` model's doc comment in schema.prisma.
 */
export const geniusLevelRubrics = [
  {
    level: 1,
    chapter: "DISCOVERY" as const,
    levelName: "Spark",
    evidenceStandard:
      "Earned when a mentor and the Genius Portfolio together show a consistent pattern of the learner voluntarily engaging with something without being told to.",
  },
  {
    level: 2,
    chapter: "DISCOVERY" as const,
    levelName: "Wonder",
    evidenceStandard:
      "Earned when the portfolio shows repeated evidence of a learner generating their own questions, not only answering questions posed to them.",
  },
  {
    level: 3,
    chapter: "DISCOVERY" as const,
    levelName: "Explorer",
    evidenceStandard:
      "Earned when the portfolio shows evidence of voluntary exploration across at least three distinct domains.",
  },
  {
    level: 4,
    chapter: "FOUNDATION" as const,
    levelName: "Builder",
    evidenceStandard:
      "Earned when the portfolio contains at least one artifact the learner planned in advance and then completed.",
  },
  {
    level: 5,
    chapter: "FOUNDATION" as const,
    levelName: "Artisan",
    evidenceStandard: "Earned when the portfolio shows at least one documented revision cycle in the same domain.",
  },
  {
    level: 6,
    chapter: "FOUNDATION" as const,
    levelName: "Voyager",
    evidenceStandard:
      "Earned when a mentor confirms sustained independent effort over at least one full term in a chosen domain.",
  },
  {
    level: 7,
    chapter: "MASTERY" as const,
    levelName: "Specialist",
    evidenceStandard:
      "Earned when the portfolio shows a body of work in a single domain clearly beyond Chapter Two evidence, evaluated against the domain's Tier 3 rubric bar.",
  },
  {
    level: 8,
    chapter: "MASTERY" as const,
    levelName: "Strategist",
    evidenceStandard:
      "Earned when the portfolio documents at least one project where the learner changed their approach in response to a real obstacle and explained the reasoning behind the change.",
  },
  {
    level: 9,
    chapter: "MASTERY" as const,
    levelName: "Vanguard",
    evidenceStandard:
      "Earned when a mentor and at least one peer can each point to a specific instance of the Vanguard's initiative or leadership.",
  },
  {
    level: 10,
    chapter: "LEGACY" as const,
    levelName: "Steward",
    evidenceStandard:
      "Earned when a mentor confirms at least one sustained standing responsibility carried faithfully over a full term.",
  },
  {
    level: 11,
    chapter: "LEGACY" as const,
    levelName: "Luminary",
    evidenceStandard:
      "Earned when at least one mentee or peer, and one adult mentor, can each independently confirm the Luminary's influence.",
  },
  {
    level: 12,
    chapter: "LEGACY" as const,
    levelName: "Legacy Bearer",
    evidenceStandard:
      "Earned through a formal portfolio review involving the learner, their mentor, and, where applicable, their family, and is the only Genius Level that requires a completed Masterpiece Project as a precondition.",
  },
];
