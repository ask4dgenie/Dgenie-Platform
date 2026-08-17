import { prisma } from "@/lib/db/prisma";

// Forces this page to render per-request rather than being prerendered at
// build time -- it exists to prove live DB connectivity, which a build-time
// static render would either fake (stale cached result) or block on. Builds
// in environments with no network path to the database (this one included --
// see the Phase 0 PR description) would otherwise hang or fail here.
export const dynamic = "force-dynamic";

// Phase 0 non-goal, Architecture Spec Part Nine / kickoff brief: "Any
// frontend beyond whatever minimal scaffold proves the Next.js app runs and
// connects to Postgres." This page is exactly that scaffold and nothing
// more -- it proves the deployed app can reach the Supabase Postgres
// instance through the `dgenie_app` role via Prisma, and nothing else. No
// learner-facing UI, no sign-in flow, no My Genie conversation.
async function getConnectivityStatus() {
  try {
    const agentDefinitionCount = await prisma.agentDefinition.count();
    return { connected: true as const, agentDefinitionCount };
  } catch (error) {
    return {
      connected: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function Home() {
  const status = await getConnectivityStatus();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            DGENIE Platform — Phase 0
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Foundation only. Nothing user-facing ships in this phase per
            Architecture Spec Part Nine.
          </p>
        </div>

        <div
          className={`rounded-lg border p-4 text-sm ${
            status.connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {status.connected ? (
            <p>
              Connected to Postgres via Prisma as{" "}
              <code className="font-mono">dgenie_app</code>.{" "}
              {status.agentDefinitionCount} AgentDefinition row
              {status.agentDefinitionCount === 1 ? "" : "s"} on file.
            </p>
          ) : (
            <p>
              Not connected: <code className="font-mono">{status.error}</code>
            </p>
          )}
        </div>

        <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <code className="font-mono">identity</code> — User, Role
            (validity window), ParentLink. Architecture Spec Part Four.
          </li>
          <li>
            <code className="font-mono">ai-gateway</code> skeleton —
            AgentDefinition, AgentInteraction. My Genie&apos;s definition
            populated; no live calls. Architecture Spec Part Five.
          </li>
          <li>
            Audit Log — append-only at the database level. Architecture Spec
            Part Ten.
          </li>
          <li>
            Row-Level Security policy framework on every table above.
            Architecture Spec Part Six.
          </li>
        </ul>
      </main>
    </div>
  );
}
