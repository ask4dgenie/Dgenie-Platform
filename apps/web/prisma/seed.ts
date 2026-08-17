import { myGenieDefinition } from "../src/modules/ai-gateway/my-genie-definition";
import { prisma } from "../src/lib/db/prisma";

/**
 * Phase 0 seed: populate exactly one AgentDefinition row, My Genie's, per
 * Architecture Spec Part Nine. Run via `npm run seed` (wraps `prisma db
 * seed`) once a real DATABASE_URL is reachable -- this build environment had
 * no network path to the Supabase project (see the Phase 0 PR description),
 * so the same content was also applied directly via the Supabase MCP
 * `apply_migration` tool as a one-off data migration
 * (prisma/migrations/20260817120300_seed_my_genie_agent_definition) so the
 * row exists in the live database now. This script is what a future
 * session/CI run should use going forward, and its `upsert` is intentionally
 * idempotent against that already-seeded row (keyed on the same `agentKey`)
 * rather than assuming a bare `create` -- running it against the live
 * database will update the existing row to match this file, not conflict
 * with it.
 */
async function main() {
  await prisma.agentDefinition.upsert({
    where: { agentKey: myGenieDefinition.agentKey },
    create: myGenieDefinition,
    update: myGenieDefinition,
  });
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
