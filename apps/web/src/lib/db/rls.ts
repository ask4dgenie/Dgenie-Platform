import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "./prisma";

/**
 * The Row-Level Security policy framework -- Architecture Spec Part Six:
 * "Every learner-owned table carries a Postgres Row-Level Security policy
 * ... in addition to an application-layer authorization check." "Every
 * access check resolves the current, valid Role record at request time
 * rather than trusting a role claim issued at login."
 *
 * The database-layer half of that policy reads a transaction-local Postgres
 * setting, `app.current_user_id`, via the `app_current_user_id()` helper
 * function defined in prisma/migrations/20260817120100_phase0_rls_and_audit_
 * grants/migration.sql. This function is the one place in the application
 * that sets it, so every module that needs a request scoped to "the human
 * this call is on behalf of" goes through here rather than re-implementing
 * the `SET LOCAL` call itself.
 *
 * `SET LOCAL` is transaction-scoped by design (resets at COMMIT/ROLLBACK),
 * which is why this wraps the whole unit of work in `$transaction` rather
 * than issuing a bare `SET` on a pooled connection that could otherwise leak
 * one request's user id into a later, unrelated request reusing the same
 * connection.
 */
export async function runAsUser<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return work(tx);
  });
}

/**
 * Runs `work` with no `app.current_user_id` set at all -- every RLS policy
 * that scopes to `app_current_user_id()` sees NULL and therefore denies
 * access, the fail-closed default (Part Six). Use this for code paths that
 * are genuinely unauthenticated and must not see any RLS-scoped row, as
 * opposed to code that has simply not been wired to a user yet.
 */
export async function runAsAnonymous<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', '', true)`;
    return work(tx);
  });
}

export type { PrismaClient };
