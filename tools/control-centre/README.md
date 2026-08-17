# DGENIE Development Control Centre

A local, read-only status board over the platform build — what phase we're in, what's
done, what's blocked. Specified in
`OPERATIONAL MANUALS/PHASE 0 BUILD KICKOFF AND DEVELOPMENT CONTROL CENTRE SPECIFICATION.md`
Part B, in the vault. This is the Option A design that document recommended: a
maintained manifest, not signals derived from git or CI, because there's nothing for
CI to derive from yet at Phase 0.

**It is not a system of record.** `GOVERNANCE DOCUMENTS/PLATFORM ARCHITECTURE AND
WORKFLOW SPECIFICATION.md` Part Nine is that. This tool only renders a rollup of what
that governance already defines. It is internal tooling for Duncan and engineering —
it carries no learner data, and it should never ship inside the public/production
build.

## Running it

No install step. Node's built-in `http` module is the only dependency.

```
cd control-centre
node server.js
```

Then open `http://localhost:4848` in Chrome and leave the tab open. It polls its own
status every 5 seconds and re-renders in place — no manual refresh needed.

If port 4848 is already taken by something else on your machine:

```
PORT=5050 node server.js
```

## How status actually updates

Open `manifest.json`. Each task has a `status` field:

- `not-started`
- `in-progress`
- `blocked`
- `complete`

Change the field, save the file. The server re-reads `manifest.json` from disk on
every request — there's no cache and no restart required. The open browser tab picks
up the change on its next poll, within about 5 seconds.

There's no automatic detection of what Claude Code has actually built. Someone —
Duncan, a future Cowork session, or a Claude Code session explicitly instructed to —
has to edit the file. If a kickoff brief is ever handed to a Claude Code session for
Phase 0 or later work, it should include an explicit instruction to update the
relevant task's `status` in this manifest as each deliverable actually lands, the same
way it should never claim a deliverable "done" without having tested it.

Optional fields:

- `note` on a task — short context, e.g. why something is blocked.
- `openBlockers` at the top level — cross-cutting gaps that aren't a build task at all
  (a missing subscription price, an unconfirmed vendor). Edit this list the same way.

## What this deliberately does not do

Per the governing spec's own non-goals: this is not the Audit Log, not the Oversight
Body's independent audit tooling (that's real constitutional infrastructure with its
own access and independence guarantees), and not a replacement for the `governance`/
`oversight` modules Phase 4 eventually builds. If it starts growing task assignment,
engineering time tracking, or budget tracking, that's scope creep into
project-management tooling this specification doesn't cover — flag it rather than
quietly add it.

## Files

- `manifest.json` — the maintained data. Source of update instructions is in the file
  itself (`updateInstructions` field).
- `server.js` — zero-dependency Node server. Serves `index.html` and `/api/status`
  (a computed rollup, not a raw dump of the manifest).
- `index.html` — the dashboard itself. Single file, no build step, no framework.
