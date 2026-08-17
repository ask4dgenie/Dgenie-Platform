import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { prisma } from "@/lib/db/prisma";

// Identity module -- Architecture Spec Part Two: "Authentication and
// identity: Auth.js (NextAuth), self-hosted against the same Postgres
// instance, not a third-party identity vendor." Part Two's stated reason:
// "losing access to a third-party auth vendor would mean losing the ability
// to log a learner into their own owned record" -- Blueprint 10 Part One's
// vendor-independence principle applied to identity specifically.
//
// The PrismaAdapter reads and writes the `users`, `accounts`, `sessions`,
// and `verification_tokens` tables directly via the `dgenie_app`-scoped
// `prisma` client -- deliberately the plain client, not one wrapped through
// `runAsUser` (src/lib/db/rls.ts), since the adapter's own job is looking up
// a user *before* any session/app.current_user_id context can exist. See
// prisma/migrations/20260817120200_phase0_users_service_policy_fix for why
// those four tables carry a permissive RLS policy rather than the
// row-owner-scoped policy every other table in this schema uses.
//
// Providers are intentionally empty in Phase 0: Part Nine's non-goals rule
// out "any frontend beyond whatever minimal scaffold proves the Next.js app
// runs and connects to Postgres," and a real sign-in flow is exactly that --
// frontend. This wiring proves the adapter, session strategy, and database
// connection are correctly configured (the actual Phase 0 deliverable,
// "self-hosted against this same Postgres instance") without building the
// sign-in UI itself, which is Phase 1+ work alongside the workflows that
// need it.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [],
});
