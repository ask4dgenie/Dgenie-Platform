# DGENIE Platform

The DGENIE Model Schools platform. A modular monolith (single deployable Next.js
application, internally bounded modules), per
[`GOVERNANCE DOCUMENTS/PLATFORM ARCHITECTURE AND WORKFLOW SPECIFICATION.md`](../../DGENIE%20MARKDOWNS/GOVERNANCE%20DOCUMENTS/PLATFORM%20ARCHITECTURE%20AND%20WORKFLOW%20SPECIFICATION.md)
Part Three, in the governance vault this repository does not contain.

## Status: Phase 0 — Foundation

Per Architecture Spec Part Nine: `identity`, the Agent Gateway skeleton (only My
Genie's `AgentDefinition` populated), the Audit Log, and the Row-Level Security
policy framework. **Nothing user-facing ships in this phase.** See
[`OPERATIONAL MANUALS/PLATFORM ARCHITECTURE AND BUILD ROADMAP.md`](../../DGENIE%20MARKDOWNS/OPERATIONAL%20MANUALS/PLATFORM%20ARCHITECTURE%20AND%20BUILD%20ROADMAP.md)
Part 5 for the full phase-by-phase build sequence.

## Layout

```
apps/web/           Next.js (App Router) application — the one deployable app
  prisma/            Prisma schema (versioned source of truth) + migrations
  src/
    app/             Routes
    auth.ts           Auth.js (NextAuth) v5, self-hosted against Postgres
    lib/db/           Prisma client singleton + the RLS session-context helper
    modules/          Per-module application code, one directory per
                       Architecture Spec Part Three module
tools/control-centre/ Local, read-only dev status dashboard (`node server.js`)
scripts/               Repo-level tooling (BLUEPRINTS/ sync)
BLUEPRINTS/             Generated mirror of the vault's canonical governance
                        documents — see "Blueprints sync" below. Never hand-edit.
```

## Getting started

```bash
cd apps/web
cp .env.example .env   # fill in DATABASE_URL and AUTH_SECRET
npm install
npm run dev
```

## Blueprints sync

`BLUEPRINTS/` is a mechanically-generated mirror of the governance vault's
`GOVERNANCE DOCUMENTS/` folder (the 15 canonical Blueprint-tier documents). It
is load-bearing for a future constitution page (Phase 1+), not a documentation
convenience — see
[`OPERATIONAL MANUALS/PLATFORM ARCHITECTURE AND BUILD ROADMAP.md`](../../DGENIE%20MARKDOWNS/OPERATIONAL%20MANUALS/PLATFORM%20ARCHITECTURE%20AND%20BUILD%20ROADMAP.md)
Part 4. Re-run and commit the result every time a canonical Blueprint-tier
document changes:

```bash
npm run sync:blueprints
```

By default this looks for the vault as a sibling directory
(`../DGENIE MARKDOWNS/GOVERNANCE DOCUMENTS`, matching this repo's layout on
the machine it was built on). Set `DGENIE_VAULT_GOVERNANCE_DOCS` to override.

## Database

PostgreSQL via Supabase (project `aqjolmpixjjrboxxderv`, "Dgenie Digital
Platform," `eu-west-1`), Prisma as ORM and the source of schema truth
(`apps/web/prisma/schema.prisma`), Prisma Migrate as the migration tool — see
that schema file's own header comment, and the Phase 0 pull request
description, for why the actual Phase 0 migrations were applied via the
Supabase MCP `apply_migration` tool rather than `prisma migrate deploy`
directly (this build environment had no network path to the database).

Every table this phase created has Row-Level Security enabled and forced, per
[Architecture Spec Part Six](../../DGENIE%20MARKDOWNS/GOVERNANCE%20DOCUMENTS/PLATFORM%20ARCHITECTURE%20AND%20WORKFLOW%20SPECIFICATION.md).
The Audit Log (`audit_log_entries`) is append-only at the database grant
level — verified live against the project that the application role holds
`SELECT`/`INSERT` only, no `UPDATE`/`DELETE`.

## Development Control Centre

`tools/control-centre/` is a local, zero-dependency status dashboard reading
`manifest.json` (a status board over the governance documents above, never
the other way around):

```bash
cd tools/control-centre
node server.js
# open http://localhost:4848
```
