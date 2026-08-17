import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 requires an explicit driver adapter at runtime -- the schema's
// `datasource` block no longer carries a connection URL Prisma Client reads
// itself (see prisma/schema.prisma and prisma.config.ts). Confirmed against
// the installed `prisma@7.9.1` CLI's own validation error, 2026-08-17.
//
// This client connects as `dgenie_app` (created in
// prisma/migrations/20260817120100_phase0_rls_and_audit_grants), the
// least-privileged application role the Row-Level Security framework is
// written against -- never the Supabase project's owner/superuser
// credential, which bypasses RLS entirely regardless of policy. Architecture
// Spec Part Six: RLS is "deliberate redundancy," not the only layer, but it
// only means anything if the running application actually connects as a
// role RLS applies to.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
