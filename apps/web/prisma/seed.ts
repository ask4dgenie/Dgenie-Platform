import { myGenieDefinition } from "../src/modules/ai-gateway/my-genie-definition";
import { parentCompanionDefinition } from "../src/modules/ai-gateway/parent-companion-definition";
import { teacherAssistantDefinition } from "../src/modules/ai-gateway/teacher-assistant-definition";
import { seedCircle, seedNationalCommunity, seedRegion } from "../src/modules/community/community-seed";
import {
  discoveryProjectPlaybook,
  geniusDevelopmentDomain,
  geniusLevelRubrics,
} from "../src/modules/curriculum/genius-development-domain";
import { bootstrapAdministrator, bootstrapMentors } from "../src/modules/identity/mentor-bootstrap";
import { prisma } from "../src/lib/db/prisma";

/**
 * Phase 0 seed: My Genie's AgentDefinition. See that section's own comment
 * below for why this and every other seed step here also has a matching
 * one-off data migration applied directly to the live Supabase project via
 * the Supabase MCP `apply_migration` tool -- this build environment has no
 * network path to the database (see the Phase 0 and Phase 1 Slice A PR
 * descriptions). This script is what a future session/CI run should use
 * going forward; every step is written as an idempotent upsert against the
 * same live-seeded rows, not a bare `create` that would conflict with them.
 */
async function seedMyGenie() {
  await prisma.agentDefinition.upsert({
    where: { agentKey: myGenieDefinition.agentKey },
    create: myGenieDefinition,
    update: myGenieDefinition,
  });
}

/**
 * Phase 1 Slice A seed: Domain Nine (Genius Development), its Discovery
 * Project playbook, and all twelve Genius Level rubric rows -- the single
 * domain populated with real content this slice, per the Roadmap's "single
 * domain, to prove the model" framing. See src/modules/curriculum/genius-
 * development-domain.ts for the governance citations behind this content.
 */
async function seedGeniusDevelopmentDomain() {
  const domain = await prisma.curriculumDomain.upsert({
    where: { code_locale: { code: geniusDevelopmentDomain.code, locale: geniusDevelopmentDomain.locale } },
    create: geniusDevelopmentDomain,
    update: geniusDevelopmentDomain,
  });

  await prisma.signatureExperiencePlaybook.upsert({
    where: {
      curriculumDomainId_type_locale: {
        curriculumDomainId: domain.id,
        type: discoveryProjectPlaybook.type,
        locale: discoveryProjectPlaybook.locale,
      },
    },
    create: { ...discoveryProjectPlaybook, curriculumDomainId: domain.id },
    update: { ...discoveryProjectPlaybook, curriculumDomainId: domain.id },
  });

  for (const rubric of geniusLevelRubrics) {
    await prisma.geniusLevelRubric.upsert({
      where: {
        curriculumDomainId_level_locale: {
          curriculumDomainId: domain.id,
          level: rubric.level,
          locale: "en",
        },
      },
      create: { ...rubric, locale: "en", curriculumDomainId: domain.id },
      update: { ...rubric, locale: "en", curriculumDomainId: domain.id },
    });
  }
}

/**
 * Phase 1 Slice A seed: the manually seeded first Mentor cohort. See
 * src/modules/identity/mentor-bootstrap.ts for why this exists and why it is
 * explicitly NOT the real New Mentor Certification path.
 */
async function seedMentorBootstrap() {
  const administrator = await prisma.user.upsert({
    where: { email: bootstrapAdministrator.email },
    create: { email: bootstrapAdministrator.email, name: bootstrapAdministrator.name },
    update: {},
  });

  const existingAdminRole = await prisma.role.findFirst({
    where: { userId: administrator.id, roleType: "ADMINISTRATOR", validTo: null },
  });
  if (!existingAdminRole) {
    await prisma.role.create({
      data: {
        userId: administrator.id,
        roleType: "ADMINISTRATOR",
        notes: "Root bootstrap Administrator, self-seeded -- no earlier Administrator exists to grant this.",
      },
    });
  }

  for (const mentor of bootstrapMentors) {
    const mentorUser = await prisma.user.upsert({
      where: { email: mentor.email },
      create: { email: mentor.email, name: mentor.name },
      update: {},
    });

    const existingMentorRole = await prisma.role.findFirst({
      where: { userId: mentorUser.id, roleType: "MENTOR", validTo: null },
    });
    if (!existingMentorRole) {
      await prisma.role.create({
        data: {
          userId: mentorUser.id,
          roleType: "MENTOR",
          grantedByUserId: administrator.id,
          notes:
            "Manually seeded first Mentor cohort (Roadmap Part 5, Phase 1; confirmed by Duncan 2026-08-17) -- not the New Mentor Certification workflow, which is Phase 2 scope.",
        },
      });
    }
  }
}

/**
 * Phase 2 seed: Parent Companion's AgentDefinition (Blueprint 14 Section
 * Four, Agent Three), `isActive: false` -- see src/modules/ai-gateway/
 * parent-companion-definition.ts's own comment for the consistency
 * reasoning behind the deferral.
 */
async function seedParentCompanion() {
  await prisma.agentDefinition.upsert({
    where: { agentKey: parentCompanionDefinition.agentKey },
    create: parentCompanionDefinition,
    update: parentCompanionDefinition,
  });
}

/**
 * Phase 2 seed: a minimal NationalCommunity/Region/Circle so the New Parent
 * workflow has a real Circle to connect a family to. See
 * src/modules/community/community-seed.ts for why this is placeholder
 * structure, not a claim about real DGENIE geography.
 */
async function seedCommunityStructure() {
  const nationalCommunity = await prisma.nationalCommunity.upsert({
    where: { id: "seed-national-community" },
    create: { id: "seed-national-community", ...seedNationalCommunity },
    update: seedNationalCommunity,
  });

  const region = await prisma.region.upsert({
    where: { id: "seed-region" },
    create: { id: "seed-region", nationalCommunityId: nationalCommunity.id, ...seedRegion },
    update: { nationalCommunityId: nationalCommunity.id, ...seedRegion },
  });

  await prisma.circle.upsert({
    where: { id: "seed-circle" },
    create: { id: "seed-circle", regionId: region.id, ...seedCircle },
    update: { regionId: region.id, ...seedCircle },
  });
}

/**
 * This task's own seed: Teacher Assistant's AgentDefinition (Blueprint 14
 * Section Four, Agent Two), `isActive: false` -- see src/modules/ai-gateway/
 * teacher-assistant-definition.ts's own comment for the consistency
 * reasoning behind the deferral, and seedMyGenie's own update above (now
 * carrying a populated `toolAllowlist` and `voiceSynthesisMinimumAge`) for
 * the three-tier gating schema this task also adds.
 */
async function seedTeacherAssistant() {
  await prisma.agentDefinition.upsert({
    where: { agentKey: teacherAssistantDefinition.agentKey },
    create: teacherAssistantDefinition,
    update: teacherAssistantDefinition,
  });
}

async function main() {
  await seedMyGenie();
  await seedGeniusDevelopmentDomain();
  await seedMentorBootstrap();
  await seedParentCompanion();
  await seedCommunityStructure();
  await seedTeacherAssistant();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
