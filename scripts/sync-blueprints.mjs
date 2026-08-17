#!/usr/bin/env node
// Copies the 15 canonical Blueprint-tier documents from the governance
// vault's GOVERNANCE DOCUMENTS/ folder into BLUEPRINTS/ at this repo's root.
//
// Roadmap Part 4 ("The BLUEPRINTS/ mirror"): "DGENIE PLATFORM/BLUEPRINTS/ is
// not a documentation convenience. apps/web/app/constitution/page.tsx reads
// that folder live to render a real page -- load-bearing, not a copy for
// convenience. GOVERNANCE DOCUMENTS in this vault remains the only place
// anyone edits Blueprint-tier text; the mirror is kept in sync by a script,
// re-run and committed every time a canonical Blueprint-tier document
// changes." That page is Phase 1+ work (Phase 0 ships nothing user-facing,
// per Architecture Spec Part Nine) -- this script exists now, per the
// Roadmap's Phase 0 section, "even though the page it feeds is built later,"
// so that page isn't blocked on this ever getting written.
//
// The 15-file list is reproduced from the vault's own CLAUDE.md, "Known
// state as of 2026-08-12" section -- the canonical enumeration, not
// re-derived here.
//
// This script is deliberately NOT hardcoded to one machine's absolute path.
// The vault (DGENIE MARKDOWNS/) lives outside this git repository, so its
// location has to be configurable: set DGENIE_VAULT_GOVERNANCE_DOCS to the
// GOVERNANCE DOCUMENTS/ folder's absolute path if this repo and the vault
// are not laid out as siblings under the same parent directory (the
// convention this script defaults to, matching how they exist on this
// build's machine today).

import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const CANONICAL_BLUEPRINTS = [
  "BLUEPRINT 01 VISION AND GRADUATE PROFILE.md",
  "BLUEPRINT 02 DISCOVERY THE GENIUS DISCOVERY FRAMEWORK.md",
  "BLUEPRINT 03 THE FORMATION FRAMEWORK.md",
  "BLUEPRINT 04 DEVELOPMENT CURRICULUM LEARNING METHODOLOGY AND LIFE TRANSITIONS.md",
  "BLUEPRINT 05 DEPLOYMENT THE GENIUS DEPLOYMENT FRAMEWORK.md",
  "BLUEPRINT 06 THE PLATFORM CONSTITUTION.md",
  "BLUEPRINT 07 SAFEGUARDING WELLBEING AND TRUST FRAMEWORK.md",
  "BLUEPRINT 08 CONSTITUTIONAL GOVERNANCE ARCHITECTURE AND SUCCESSION.md",
  "BLUEPRINT 09 INDEPENDENT TRUST SAFETY AND CONSTITUTIONAL OVERSIGHT CHARTER.md",
  "BLUEPRINT 10 STEWARDSHIP FINANCE PARTNERSHIPS AND EXPANSION.md",
  "BLUEPRINT 11 TEACHER AND MENTOR FRAMEWORK.md",
  "BLUEPRINT 12 PARENT AND FAMILY FRAMEWORK.md",
  "BLUEPRINT 13 INTELLIGENCE AND WISDOM ARCHITECTURE.md",
  "BLUEPRINT 14 AI ECOSYSTEM AND SAFETY SPECIFICATION.md",
  "BLUEPRINT 15 EVIDENCE AND RESEARCH FRAMEWORK.md",
];

const defaultSourceDir = path.resolve(
  repoRoot,
  "..",
  "DGENIE MARKDOWNS",
  "GOVERNANCE DOCUMENTS",
);
const sourceDir = process.env.DGENIE_VAULT_GOVERNANCE_DOCS
  ? path.resolve(process.env.DGENIE_VAULT_GOVERNANCE_DOCS)
  : defaultSourceDir;

const destDir = path.join(repoRoot, "BLUEPRINTS");

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(
      `sync:blueprints -- source directory not found:\n  ${sourceDir}\n\n` +
        "Set DGENIE_VAULT_GOVERNANCE_DOCS to the vault's GOVERNANCE DOCUMENTS/ " +
        "folder if this repo isn't checked out as a sibling of DGENIE MARKDOWNS/ " +
        "on this machine.",
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(destDir, { recursive: true });

  const missing = [];
  let copied = 0;

  for (const filename of CANONICAL_BLUEPRINTS) {
    const src = path.join(sourceDir, filename);
    if (!existsSync(src)) {
      missing.push(filename);
      continue;
    }
    await copyFile(src, path.join(destDir, filename));
    copied += 1;
  }

  console.log(`sync:blueprints -- copied ${copied}/${CANONICAL_BLUEPRINTS.length} files to ${destDir}`);

  if (missing.length > 0) {
    console.error(
      `sync:blueprints -- ${missing.length} canonical file(s) not found in source directory:\n` +
        missing.map((f) => `  - ${f}`).join("\n"),
    );
    process.exitCode = 1;
  }
}

main();
